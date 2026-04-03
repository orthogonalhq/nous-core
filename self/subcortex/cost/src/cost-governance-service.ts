/**
 * CostGovernanceService — Core cost governance engine.
 *
 * Subscribes to inference events, computes dollar costs via the pricing table,
 * accumulates costs across four aggregation dimensions, evaluates budget policies,
 * and emits periodic cost snapshots.
 *
 * Pattern follows TokenAccumulatorService (event subscription, accumulation,
 * snapshot emission, dispose lifecycle).
 */
import { randomUUID } from 'node:crypto';
import type {
  IEventBus,
  InferenceCallCompletePayload,
  CostEvent,
  BudgetPolicy,
  BudgetStatus,
  CostBreakdownEntry,
  CostTimeSeriesBucket,
  CostSummary,
  PricingTable,
} from '@nous/shared';
import { lookupPricingTier, computeCost } from './pricing-table.js';
import { CostEnforcement, type IOpctlServiceForEnforcement } from './cost-enforcement.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProjectConfig {
  budgetPolicy?: BudgetPolicy;
}

export interface CostGovernanceServiceDeps {
  eventBus: IEventBus;
  opctlService: IOpctlServiceForEnforcement;
  pricingTable: PricingTable;
  getProjectConfig: (projectId: string) => ProjectConfig | undefined;
}

interface AggregationEntry {
  totalCostUsd: number;
  inputCostUsd: number;
  outputCostUsd: number;
  eventCount: number;
}

interface ProjectCostState {
  periodStart: Date;
  periodEnd: Date;             // Exclusive end (start of next period)
  periodType: 'monthly' | 'weekly';
  totalSpend: number;
  byProviderModel: Map<string, AggregationEntry>;
  byAgentClass: Map<string, AggregationEntry>;
  byCorrelationRoot: Map<string, AggregationEntry>;
  softAlertFiredThisPeriod: boolean;
  hardCeilingFiredThisPeriod: boolean;
  correlationRootCache: Map<string, string>;
  currentHardCeilingUsd: number | undefined;
}

// ---------------------------------------------------------------------------
// Period boundary computation (UTC-only)
// ---------------------------------------------------------------------------

export function computePeriodBounds(
  now: Date,
  periodType: 'monthly' | 'weekly',
): { start: Date; end: Date } {
  if (periodType === 'monthly') {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    // Exclusive end: 1st of next month
    const end = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));
    return { start, end };
  }

  // Weekly: Monday 00:00:00 UTC to next Monday 00:00:00 UTC (exclusive)
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon, ...
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const start = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + diffToMonday,
    0, 0, 0, 0,
  ));
  // Exclusive end: next Monday
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { start, end };
}

// ---------------------------------------------------------------------------
// Correlation root resolution
// ---------------------------------------------------------------------------

function resolveCorrelationRoot(
  correlationRunId: string,
  correlationParentId: string | undefined,
  cache: Map<string, string>,
  allEvents: CostEvent[],
): string {
  const cached = cache.get(correlationRunId);
  if (cached) return cached;

  if (!correlationParentId) {
    cache.set(correlationRunId, correlationRunId);
    return correlationRunId;
  }

  let current = correlationParentId;
  const visited = new Set<string>([correlationRunId]);

  while (current) {
    if (visited.has(current)) break; // cycle detection
    visited.add(current);

    const cachedRoot = cache.get(current);
    if (cachedRoot) {
      for (const id of visited) cache.set(id, cachedRoot);
      return cachedRoot;
    }

    const parentEvent = allEvents.find(e => e.correlationRunId === current);
    if (!parentEvent || !parentEvent.correlationParentId) {
      // Chain ends here
      for (const id of visited) cache.set(id, current);
      return current;
    }
    current = parentEvent.correlationParentId;
  }

  cache.set(correlationRunId, correlationRunId);
  return correlationRunId;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addToAggregation(
  map: Map<string, AggregationEntry>,
  key: string,
  inputCostUsd: number,
  outputCostUsd: number,
  totalCostUsd: number,
): void {
  const existing = map.get(key);
  if (existing) {
    existing.totalCostUsd += totalCostUsd;
    existing.inputCostUsd += inputCostUsd;
    existing.outputCostUsd += outputCostUsd;
    existing.eventCount += 1;
  } else {
    map.set(key, { totalCostUsd, inputCostUsd, outputCostUsd, eventCount: 1 });
  }
}

function createEmptyProjectState(periodType: 'monthly' | 'weekly', now: Date): ProjectCostState {
  const { start, end } = computePeriodBounds(now, periodType);
  return {
    periodStart: start,
    periodEnd: end,
    periodType,
    totalSpend: 0,
    byProviderModel: new Map(),
    byAgentClass: new Map(),
    byCorrelationRoot: new Map(),
    softAlertFiredThisPeriod: false,
    hardCeilingFiredThisPeriod: false,
    correlationRootCache: new Map(),
    currentHardCeilingUsd: undefined,
  };
}

function resetProjectState(state: ProjectCostState, now: Date): void {
  const { start, end } = computePeriodBounds(now, state.periodType);
  state.periodStart = start;
  state.periodEnd = end;
  state.totalSpend = 0;
  state.byProviderModel.clear();
  state.byAgentClass.clear();
  state.byCorrelationRoot.clear();
  state.softAlertFiredThisPeriod = false;
  state.hardCeilingFiredThisPeriod = false;
  state.correlationRootCache.clear();
}

// ---------------------------------------------------------------------------
// CostGovernanceService
// ---------------------------------------------------------------------------

const DEFAULT_SNAPSHOT_INTERVAL_MS = 30_000;

export class CostGovernanceService {
  private readonly costEvents: CostEvent[] = [];
  private readonly projectStates = new Map<string, ProjectCostState>();
  private readonly enforcement: CostEnforcement;
  private readonly subscriptionIds: string[] = [];
  private snapshotTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;
  private budgetPolicies = new Map<string, BudgetPolicy>();

  constructor(
    private readonly deps: CostGovernanceServiceDeps,
    options?: { snapshotIntervalMs?: number },
  ) {
    this.enforcement = new CostEnforcement({ opctlService: deps.opctlService });

    // Subscribe to both inference event channels (SF-1)
    const callId = deps.eventBus.subscribe('inference:call-complete', (payload) => {
      this.handleInferenceEvent(payload);
    });
    const streamId = deps.eventBus.subscribe('inference:stream-complete', (payload) => {
      this.handleInferenceEvent(payload);
    });
    this.subscriptionIds.push(callId, streamId);

    const intervalMs = options?.snapshotIntervalMs ?? DEFAULT_SNAPSHOT_INTERVAL_MS;
    this.snapshotTimer = setInterval(() => {
      this.emitSnapshots();
    }, intervalMs);
  }

  // -----------------------------------------------------------------------
  // Event handling
  // -----------------------------------------------------------------------

  private handleInferenceEvent(payload: InferenceCallCompletePayload): void {
    if (this.disposed) return;

    const projectId = payload.projectId ?? '_system';
    const providerId = payload.providerId;
    const modelId = payload.modelId;
    const agentClass = payload.agentClass ?? 'Unknown';
    const inputTokens = payload.inputTokens ?? 0;
    const outputTokens = payload.outputTokens ?? 0;
    const correlationRunId = payload.correlationRunId ?? payload.traceId;
    const correlationParentId = payload.correlationParentId;

    // Pricing lookup
    const tier = lookupPricingTier(this.deps.pricingTable, providerId, modelId);
    let inputCostUsd = 0;
    let outputCostUsd = 0;
    let totalCostUsd = 0;
    let pricingMiss = false;

    if (tier) {
      const cost = computeCost(inputTokens, outputTokens, tier);
      inputCostUsd = cost.inputCostUsd;
      outputCostUsd = cost.outputCostUsd;
      totalCostUsd = cost.totalCostUsd;
    } else {
      pricingMiss = true;
    }

    // Create CostEvent
    const costEvent: CostEvent = {
      id: randomUUID(),
      timestamp: Date.now(),
      projectId,
      providerId,
      modelId,
      agentClass,
      correlationRunId,
      correlationParentId,
      inputTokens,
      outputTokens,
      inputCostUsd,
      outputCostUsd,
      totalCostUsd,
      pricingMiss: pricingMiss || undefined,
    };
    this.costEvents.push(costEvent);

    // Fire-and-forget event emission
    try {
      this.deps.eventBus.publish('cost:event-recorded', costEvent);
    } catch { /* fire-and-forget */ }

    // Ensure project state exists and check period boundary
    const state = this.getOrCreateProjectState(projectId);
    this.checkPeriodBoundary(state, projectId);

    // Accumulate into 4 buckets
    state.totalSpend += totalCostUsd;
    addToAggregation(state.byProviderModel, `${providerId}:${modelId}`, inputCostUsd, outputCostUsd, totalCostUsd);
    addToAggregation(state.byAgentClass, agentClass, inputCostUsd, outputCostUsd, totalCostUsd);

    const rootRunId = resolveCorrelationRoot(
      correlationRunId,
      correlationParentId,
      state.correlationRootCache,
      this.costEvents,
    );
    addToAggregation(state.byCorrelationRoot, rootRunId, inputCostUsd, outputCostUsd, totalCostUsd);

    // Budget evaluation
    this.evaluateBudget(projectId, state);
  }

  // -----------------------------------------------------------------------
  // Period management
  // -----------------------------------------------------------------------

  private getOrCreateProjectState(projectId: string): ProjectCostState {
    let state = this.projectStates.get(projectId);
    if (!state) {
      const config = this.deps.getProjectConfig(projectId);
      const policy = this.budgetPolicies.get(projectId) ?? config?.budgetPolicy;
      const periodType = policy?.period ?? 'monthly';
      state = createEmptyProjectState(periodType, new Date());
      if (policy) {
        state.currentHardCeilingUsd = policy.hardCeilingUsd;
      }
      this.projectStates.set(projectId, state);
    }
    return state;
  }

  private checkPeriodBoundary(state: ProjectCostState, projectId: string): void {
    const now = new Date();
    // Exclusive end comparison (M-1): now >= periodEnd means we've crossed into next period
    if (now.getTime() >= state.periodEnd.getTime()) {
      resetProjectState(state, now);
      // Remove cost events for this project from previous period
      // (V1: we keep all events for simplicity, period boundary resets aggregation only)
    }
  }

  // -----------------------------------------------------------------------
  // Budget evaluation
  // -----------------------------------------------------------------------

  private evaluateBudget(projectId: string, state: ProjectCostState): void {
    const config = this.deps.getProjectConfig(projectId);
    const policy = this.budgetPolicies.get(projectId) ?? config?.budgetPolicy;
    if (!policy || !policy.enabled) return;
    if (policy.hardCeilingUsd <= 0) return;

    const utilizationPercent = (state.totalSpend / policy.hardCeilingUsd) * 100;

    // Hard ceiling check (fires first to ensure enforcement even if both thresholds cross simultaneously)
    if (
      state.totalSpend >= policy.hardCeilingUsd &&
      !state.hardCeilingFiredThisPeriod
    ) {
      state.hardCeilingFiredThisPeriod = true;
      try {
        this.deps.eventBus.publish('cost:budget-exceeded', {
          projectId,
          utilizationPercent,
          currentSpendUsd: state.totalSpend,
          budgetCeilingUsd: policy.hardCeilingUsd,
        });
      } catch { /* fire-and-forget */ }
      // Trigger enforcement (fire-and-forget, async)
      this.enforcement.triggerPause(projectId, state.totalSpend, policy.hardCeilingUsd).catch(() => {});
    }

    // Soft threshold check
    if (
      utilizationPercent >= policy.softThresholdPercent &&
      !state.softAlertFiredThisPeriod
    ) {
      state.softAlertFiredThisPeriod = true;
      try {
        this.deps.eventBus.publish('cost:budget-alert', {
          projectId,
          utilizationPercent,
          thresholdPercent: policy.softThresholdPercent,
          currentSpendUsd: state.totalSpend,
          budgetCeilingUsd: policy.hardCeilingUsd,
        });
      } catch { /* fire-and-forget */ }
    }
  }

  // -----------------------------------------------------------------------
  // Snapshot emission
  // -----------------------------------------------------------------------

  private emitSnapshots(): void {
    if (this.disposed) return;
    for (const [projectId, state] of this.projectStates) {
      const config = this.deps.getProjectConfig(projectId);
      const policy = this.budgetPolicies.get(projectId) ?? config?.budgetPolicy;
      const ceilingUsd = policy?.hardCeilingUsd ?? 0;
      const utilizationPercent = ceilingUsd > 0
        ? (state.totalSpend / ceilingUsd) * 100
        : 0;

      const byProvider: Record<string, number> = {};
      for (const [key, entry] of state.byProviderModel) {
        byProvider[key] = entry.totalCostUsd;
      }

      const byAgentClass: Record<string, number> = {};
      for (const [key, entry] of state.byAgentClass) {
        byAgentClass[key] = entry.totalCostUsd;
      }

      try {
        this.deps.eventBus.publish('cost:snapshot', {
          projectId,
          periodStart: state.periodStart.toISOString(),
          periodEnd: new Date(state.periodEnd.getTime() - 1).toISOString(),
          totalSpendUsd: state.totalSpend,
          budgetCeilingUsd: ceilingUsd,
          utilizationPercent,
          byProvider,
          byAgentClass,
        });
      } catch { /* fire-and-forget */ }
    }
  }

  // -----------------------------------------------------------------------
  // Public API — Queries
  // -----------------------------------------------------------------------

  getBudgetStatus(projectId: string): BudgetStatus {
    const config = this.deps.getProjectConfig(projectId);
    const policy = this.budgetPolicies.get(projectId) ?? config?.budgetPolicy;
    const state = this.projectStates.get(projectId);

    if (!policy || !state) {
      const now = new Date();
      const periodType = policy?.period ?? 'monthly';
      const { start, end } = computePeriodBounds(now, periodType);
      return {
        hasBudget: false,
        currentSpendUsd: 0,
        budgetCeilingUsd: 0,
        utilizationPercent: 0,
        softAlertFired: false,
        hardCeilingFired: false,
        periodStart: start.toISOString(),
        periodEnd: new Date(end.getTime() - 1).toISOString(),
        projectControlState: 'running',
      };
    }

    const ceilingUsd = policy.hardCeilingUsd;
    const utilizationPercent = ceilingUsd > 0
      ? (state.totalSpend / ceilingUsd) * 100
      : 0;

    return {
      hasBudget: policy.enabled,
      currentSpendUsd: state.totalSpend,
      budgetCeilingUsd: ceilingUsd,
      utilizationPercent,
      softAlertFired: state.softAlertFiredThisPeriod,
      hardCeilingFired: state.hardCeilingFiredThisPeriod,
      periodStart: state.periodStart.toISOString(),
      // Convert exclusive-end to inclusive for display
      periodEnd: new Date(state.periodEnd.getTime() - 1).toISOString(),
      projectControlState: 'running', // V1: actual state comes from opctlService in 1.3
    };
  }

  getCostBreakdown(
    projectId: string,
    groupBy: 'project' | 'provider' | 'agentClass' | 'correlationRoot',
  ): CostBreakdownEntry[] {
    const state = this.projectStates.get(projectId);
    if (!state) return [];

    if (groupBy === 'project') {
      return [{
        key: projectId,
        totalCostUsd: state.totalSpend,
        inputCostUsd: Array.from(state.byProviderModel.values()).reduce((s, e) => s + e.inputCostUsd, 0),
        outputCostUsd: Array.from(state.byProviderModel.values()).reduce((s, e) => s + e.outputCostUsd, 0),
        eventCount: Array.from(state.byProviderModel.values()).reduce((s, e) => s + e.eventCount, 0),
      }];
    }

    const map = groupBy === 'provider'
      ? state.byProviderModel
      : groupBy === 'agentClass'
        ? state.byAgentClass
        : state.byCorrelationRoot;

    return Array.from(map.entries()).map(([key, entry]) => ({
      key,
      totalCostUsd: entry.totalCostUsd,
      inputCostUsd: entry.inputCostUsd,
      outputCostUsd: entry.outputCostUsd,
      eventCount: entry.eventCount,
    }));
  }

  getCostTimeSeries(projectId: string, bucketMinutes: number): CostTimeSeriesBucket[] {
    const state = this.projectStates.get(projectId);
    if (!state) return [];

    const bucketMs = bucketMinutes * 60 * 1000;
    const periodStartMs = state.periodStart.getTime();

    const projectEvents = this.costEvents.filter(e =>
      e.projectId === projectId &&
      e.timestamp >= periodStartMs &&
      e.timestamp < state.periodEnd.getTime()
    );

    if (projectEvents.length === 0) return [];

    const buckets = new Map<number, { totalCostUsd: number; eventCount: number }>();

    for (const event of projectEvents) {
      const bucketIndex = Math.floor((event.timestamp - periodStartMs) / bucketMs);
      const bucketStartMs = periodStartMs + bucketIndex * bucketMs;
      const existing = buckets.get(bucketStartMs);
      if (existing) {
        existing.totalCostUsd += event.totalCostUsd;
        existing.eventCount += 1;
      } else {
        buckets.set(bucketStartMs, { totalCostUsd: event.totalCostUsd, eventCount: 1 });
      }
    }

    return Array.from(buckets.entries())
      .sort(([a], [b]) => a - b)
      .map(([bucketStartMs, data]) => ({
        bucketStart: new Date(bucketStartMs).toISOString(),
        totalCostUsd: data.totalCostUsd,
        eventCount: data.eventCount,
      }));
  }

  getCostSummary(projectId: string): CostSummary {
    const state = this.projectStates.get(projectId);
    if (!state) {
      const now = new Date();
      const { start, end } = computePeriodBounds(now, 'monthly');
      return {
        totalCostUsd: 0,
        totalInputCostUsd: 0,
        totalOutputCostUsd: 0,
        totalEvents: 0,
        periodStart: start.toISOString(),
        periodEnd: new Date(end.getTime() - 1).toISOString(),
      };
    }

    let totalInputCostUsd = 0;
    let totalOutputCostUsd = 0;
    let totalEvents = 0;
    for (const entry of state.byProviderModel.values()) {
      totalInputCostUsd += entry.inputCostUsd;
      totalOutputCostUsd += entry.outputCostUsd;
      totalEvents += entry.eventCount;
    }

    // Find top provider:model and top model
    let topProviderKey: string | undefined;
    let topProviderCost = 0;
    for (const [key, entry] of state.byProviderModel) {
      if (entry.totalCostUsd > topProviderCost) {
        topProviderCost = entry.totalCostUsd;
        topProviderKey = key;
      }
    }

    const topProvider = topProviderKey;
    const topModel = topProviderKey ? topProviderKey.split(':')[1] : undefined;

    return {
      totalCostUsd: state.totalSpend,
      totalInputCostUsd,
      totalOutputCostUsd,
      totalEvents,
      periodStart: state.periodStart.toISOString(),
      periodEnd: new Date(state.periodEnd.getTime() - 1).toISOString(),
      topProvider,
      topModel,
    };
  }

  // -----------------------------------------------------------------------
  // Public API — Mutations
  // -----------------------------------------------------------------------

  setBudgetPolicy(projectId: string, policy: BudgetPolicy): void {
    const previous = this.budgetPolicies.get(projectId);
    this.budgetPolicies.set(projectId, policy);

    const state = this.projectStates.get(projectId);
    if (state) {
      // Update period type if changed
      if (state.periodType !== policy.period) {
        state.periodType = policy.period;
        const { start, end } = computePeriodBounds(new Date(), policy.period);
        state.periodStart = start;
        state.periodEnd = end;
      }
      // Reset hard ceiling fired flag if ceiling changed.
      // Compare against both the previous setBudgetPolicy value and the
      // state's tracked ceiling (which may come from getProjectConfig).
      const previousCeiling = previous?.hardCeilingUsd ?? state.currentHardCeilingUsd;
      if (previousCeiling !== undefined && previousCeiling !== policy.hardCeilingUsd) {
        state.hardCeilingFiredThisPeriod = false;
      }
      state.currentHardCeilingUsd = policy.hardCeilingUsd;
    }
    // Does NOT auto-resume paused projects
  }

  removeBudgetPolicy(projectId: string): void {
    this.budgetPolicies.delete(projectId);
    // Does NOT clear cost data — project state (aggregation buckets, events) remains intact
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  dispose(): void {
    this.disposed = true;
    if (this.snapshotTimer != null) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }
    for (const id of this.subscriptionIds) {
      this.deps.eventBus.unsubscribe(id);
    }
  }

  /** Expose enforcement module for testing. */
  getEnforcement(): CostEnforcement {
    return this.enforcement;
  }
}
