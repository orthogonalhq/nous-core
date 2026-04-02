/**
 * CostGovernanceService — Real-time cost tracking and budget enforcement.
 *
 * Subscribes to inference:call-complete and inference:stream-complete events,
 * calculates dollar costs from token usage via the pricing registry, and
 * enforces budget thresholds by emitting alerts and triggering opctl pause
 * commands when ceilings are reached.
 *
 * Canonical sources:
 * - cost-governance-service-v1.md
 * - opctl-internal-actor-v1.md
 * - budget-policy-lifecycle-v1.md
 */
import { createHash } from 'node:crypto';
import type {
  IEventBus,
  IOpctlService,
  ICostGovernanceService,
  InferenceCallCompletePayload,
  ProjectConfig,
  CostWindow,
  CostSnapshot,
  CostAccumulatorEntry,
  ModelPricingEntry,
  BudgetStatus,
  BudgetAlertLevel,
  BudgetPeriodType,
  ControlCommandEnvelope,
  ControlCommandId,
  ProjectId,
} from '@nous/shared';
import { SYSTEM_SCOPE_SENTINEL_PROJECT_ID } from '@nous/shared';
import { ModelPricingRegistry } from './model-pricing-registry.js';

// --- Internal Actor Constants (per opctl-internal-actor-v1.md) ---

const COST_GOVERNANCE_ACTOR_ID = '00000000-0000-4000-a000-000000000001';
const COST_GOVERNANCE_SESSION_ID = '00000000-0000-4000-a000-000000000002';

// --- Internal Accumulator Types ---

interface AccumulatorEntry {
  inputTokens: number;
  outputTokens: number;
  inputCostDollars: number;
  outputCostDollars: number;
  callCount: number;
}

interface ProjectCostAccumulator {
  periodStart: Date;
  periodType: BudgetPeriodType;
  /** Keyed by `${providerId}:${modelId}` */
  entries: Map<string, AccumulatorEntry>;
  totalCostDollars: number;
  softThresholdFired: boolean;
  hardCeilingFired: boolean;
}

// --- Dependencies ---

export interface CostGovernanceServiceDeps {
  eventBus: IEventBus;
  opctlService: IOpctlService;
  pricingRegistry: ModelPricingRegistry;
  getProjectConfig: (projectId: string) => ProjectConfig | null;
}

// --- Helpers ---

function startOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function startOfNextMonth(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return d;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  // Monday = start of ISO week
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function startOfNextWeek(date: Date): Date {
  const d = startOfWeek(date);
  d.setUTCDate(d.getUTCDate() + 7);
  return d;
}

function entryKey(providerId: string, modelId: string): string {
  return `${providerId}:${modelId}`;
}

// --- Service ---

export class CostGovernanceService implements ICostGovernanceService {
  private projectAccumulators = new Map<string, ProjectCostAccumulator>();
  private subscriptionIds: string[] = [];
  private disposed = false;
  private actorSeq = 0;

  constructor(private readonly deps: CostGovernanceServiceDeps) {
    const callCompleteId = this.deps.eventBus.subscribe(
      'inference:call-complete',
      (payload) => { this.handleInferenceEvent(payload); },
    );
    const streamCompleteId = this.deps.eventBus.subscribe(
      'inference:stream-complete',
      (payload) => { this.handleInferenceEvent(payload); },
    );
    this.subscriptionIds.push(callCompleteId, streamCompleteId);
  }

  // --- Event Handling ---

  private handleInferenceEvent(payload: InferenceCallCompletePayload): void {
    if (this.disposed) return;

    const { projectId, providerId, modelId, inputTokens, outputTokens } = payload;

    // Guard: skip system-scope and unattributed events
    if (!projectId || projectId === SYSTEM_SCOPE_SENTINEL_PROJECT_ID) return;

    // Look up pricing
    const pricing = this.deps.pricingRegistry.getPrice(providerId, modelId);
    const input = inputTokens ?? 0;
    const output = outputTokens ?? 0;
    const inputCost = pricing ? (input / 1_000_000) * pricing.inputPricePerMillionTokens : 0;
    const outputCost = pricing ? (output / 1_000_000) * pricing.outputPricePerMillionTokens : 0;
    const totalCost = inputCost + outputCost;

    // Get or create accumulator
    const accum = this.getOrCreateAccumulator(projectId);

    // Period rotation (lazy, checked on every event)
    this.rotatePeriodIfNeeded(accum, projectId);

    // Accumulate
    const key = entryKey(providerId, modelId);
    const existing = accum.entries.get(key);
    if (existing) {
      existing.inputTokens += input;
      existing.outputTokens += output;
      existing.inputCostDollars += inputCost;
      existing.outputCostDollars += outputCost;
      existing.callCount += 1;
    } else {
      accum.entries.set(key, {
        inputTokens: input,
        outputTokens: output,
        inputCostDollars: inputCost,
        outputCostDollars: outputCost,
        callCount: 1,
      });
    }
    accum.totalCostDollars += totalCost;

    // Budget check
    this.checkBudgetThresholds(projectId, accum);
  }

  private getOrCreateAccumulator(projectId: string): ProjectCostAccumulator {
    let accum = this.projectAccumulators.get(projectId);
    if (!accum) {
      const config = this.deps.getProjectConfig(projectId);
      const periodType: BudgetPeriodType = config?.costBudget?.periodType ?? 'monthly';
      accum = {
        periodStart: this.computePeriodStart(periodType, new Date()),
        periodType,
        entries: new Map(),
        totalCostDollars: 0,
        softThresholdFired: false,
        hardCeilingFired: false,
      };
      this.projectAccumulators.set(projectId, accum);
    }
    return accum;
  }

  private computePeriodStart(periodType: BudgetPeriodType, now: Date): Date {
    switch (periodType) {
      case 'monthly': return startOfMonth(now);
      case 'weekly': return startOfWeek(now);
      case 'none': return now;
    }
  }

  private computePeriodEnd(periodType: BudgetPeriodType, periodStart: Date): Date | undefined {
    switch (periodType) {
      case 'monthly': return startOfNextMonth(periodStart);
      case 'weekly': return startOfNextWeek(periodStart);
      case 'none': return undefined;
    }
  }

  private rotatePeriodIfNeeded(accum: ProjectCostAccumulator, projectId: string): void {
    if (accum.periodType === 'none') return;

    const now = new Date();
    const periodEnd = this.computePeriodEnd(accum.periodType, accum.periodStart);
    if (periodEnd && now >= periodEnd) {
      // Reset accumulator
      accum.entries.clear();
      accum.totalCostDollars = 0;
      accum.softThresholdFired = false;
      accum.hardCeilingFired = false;
      accum.periodStart = this.computePeriodStart(accum.periodType, now);

      // Re-check if period type changed in config
      const config = this.deps.getProjectConfig(projectId);
      if (config?.costBudget?.periodType && config.costBudget.periodType !== accum.periodType) {
        accum.periodType = config.costBudget.periodType;
        accum.periodStart = this.computePeriodStart(accum.periodType, now);
      }
    }
  }

  private checkBudgetThresholds(projectId: string, accum: ProjectCostAccumulator): void {
    const config = this.deps.getProjectConfig(projectId);
    const policy = config?.costBudget;
    if (!policy || !policy.enabled) return;

    const softThresholdDollars = (policy.hardCeilingDollars * policy.softThresholdPercent) / 100;
    const percentUsed = (accum.totalCostDollars / policy.hardCeilingDollars) * 100;
    const now = new Date().toISOString();

    // Check soft threshold first (ordering: soft, then hard)
    if (
      accum.totalCostDollars >= softThresholdDollars &&
      !accum.softThresholdFired
    ) {
      accum.softThresholdFired = true;
      try {
        this.deps.eventBus.publish('cost:budget-alert', {
          projectId,
          alertLevel: 'soft_threshold',
          currentSpendDollars: accum.totalCostDollars,
          thresholdDollars: softThresholdDollars,
          percentUsed,
          emittedAt: now,
        });
      } catch { /* fire-and-forget */ }
      try {
        this.deps.eventBus.publish('escalation:new', {
          escalationId: `cost-soft-${projectId}-${Date.now()}`,
          projectId,
          severity: 'medium',
          message: `Cost budget warning: project ${projectId} has reached ${percentUsed.toFixed(1)}% of the $${policy.hardCeilingDollars} budget ceiling ($${accum.totalCostDollars.toFixed(4)} spent).`,
        });
      } catch { /* fire-and-forget */ }
    }

    // Check hard ceiling
    if (
      accum.totalCostDollars >= policy.hardCeilingDollars &&
      !accum.hardCeilingFired
    ) {
      accum.hardCeilingFired = true;
      try {
        this.deps.eventBus.publish('cost:budget-alert', {
          projectId,
          alertLevel: 'hard_ceiling',
          currentSpendDollars: accum.totalCostDollars,
          thresholdDollars: policy.hardCeilingDollars,
          percentUsed,
          emittedAt: now,
        });
      } catch { /* fire-and-forget */ }

      // Trigger opctl pause (async fire-and-forget)
      const envelope = this.buildPauseEnvelope(projectId);
      this.deps.opctlService.submitCommand(envelope).catch(() => {
        /* logged externally — hardCeilingFired prevents retries */
      });
    }
  }

  // --- Envelope Construction (per opctl-internal-actor-v1.md) ---

  private buildPauseEnvelope(projectId: string): ControlCommandEnvelope {
    const commandId = crypto.randomUUID() as ControlCommandId;
    const nonce = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60_000); // 1 minute TTL

    return {
      control_command_id: commandId,
      actor_type: 'orchestration_agent',
      actor_id: COST_GOVERNANCE_ACTOR_ID,
      actor_session_id: COST_GOVERNANCE_SESSION_ID,
      actor_seq: ++this.actorSeq,
      nonce,
      issued_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      scope: {
        class: 'project_run_scope',
        kind: 'project_run',
        target_ids: [],
        project_id: projectId as ProjectId,
      },
      payload_hash: createHash('sha256')
        .update(JSON.stringify({ action: 'pause', projectId }))
        .digest('hex'),
      command_signature: 'cost-governance-internal',
      action: 'pause',
    };
  }

  // --- Public API ---

  getProjectCostSnapshot(projectId: string, window: CostWindow): CostSnapshot | null {
    const accum = this.projectAccumulators.get(projectId);
    if (!accum) return null;

    // For 'period' window, use the accumulator directly.
    // For today/week/month, we only maintain the period accumulator per the decision doc.
    // The period accumulator is the authoritative source.
    const entries = this.buildCostEntries(accum);
    const windowStart = accum.periodStart;

    return {
      projectId,
      window,
      windowStart: windowStart.toISOString(),
      totalCostDollars: accum.totalCostDollars,
      entries,
      snapshotAt: new Date().toISOString(),
    };
  }

  getBudgetStatus(projectId: string): BudgetStatus | null {
    const config = this.deps.getProjectConfig(projectId);
    const policy = config?.costBudget;
    if (!policy) return null;

    const accum = this.projectAccumulators.get(projectId);
    const currentSpend = accum?.totalCostDollars ?? 0;
    const softThresholdDollars = (policy.hardCeilingDollars * policy.softThresholdPercent) / 100;
    const percentUsed = (currentSpend / policy.hardCeilingDollars) * 100;
    const periodStart = accum?.periodStart ?? this.computePeriodStart(policy.periodType, new Date());
    const periodEnd = this.computePeriodEnd(policy.periodType, periodStart);

    let alertLevel: BudgetAlertLevel = 'normal';
    if (currentSpend >= policy.hardCeilingDollars) {
      alertLevel = 'hard_ceiling';
    } else if (currentSpend >= softThresholdDollars) {
      alertLevel = 'soft_threshold';
    }

    return {
      projectId,
      currentSpendDollars: currentSpend,
      hardCeilingDollars: policy.hardCeilingDollars,
      softThresholdDollars,
      percentUsed,
      alertLevel,
      periodType: policy.periodType,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd?.toISOString(),
      isPaused: accum?.hardCeilingFired ?? false,
    };
  }

  getProviderBreakdown(projectId: string, _window: CostWindow): CostAccumulatorEntry[] {
    const accum = this.projectAccumulators.get(projectId);
    if (!accum) return [];
    return this.buildCostEntries(accum);
  }

  getPricingTable(): ModelPricingEntry[] {
    return this.deps.pricingRegistry.getAll();
  }

  setPricingEntry(entry: ModelPricingEntry): void {
    this.deps.pricingRegistry.setEntry(entry);
  }

  removePricingEntry(providerId: string, modelId: string): boolean {
    return this.deps.pricingRegistry.removeEntry(providerId, modelId);
  }

  // --- Lifecycle ---

  dispose(): void {
    this.disposed = true;
    for (const id of this.subscriptionIds) {
      this.deps.eventBus.unsubscribe(id);
    }
    this.subscriptionIds = [];
    this.projectAccumulators.clear();
  }

  // --- Private Helpers ---

  private buildCostEntries(accum: ProjectCostAccumulator): CostAccumulatorEntry[] {
    const result: CostAccumulatorEntry[] = [];
    for (const [key, entry] of accum.entries) {
      const [providerId, modelId] = key.split(':');
      result.push({
        providerId: providerId!,
        modelId: modelId!,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        inputCostDollars: entry.inputCostDollars,
        outputCostDollars: entry.outputCostDollars,
        totalCostDollars: entry.inputCostDollars + entry.outputCostDollars,
        callCount: entry.callCount,
      });
    }
    return result;
  }
}
