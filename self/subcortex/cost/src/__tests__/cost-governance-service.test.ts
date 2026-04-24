import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IEventBus, INotificationService, InferenceCallCompletePayload, BudgetPolicy } from '@nous/shared';
import { CostGovernanceService, computePeriodBounds, type CostGovernanceServiceDeps, type ProjectConfig } from '../cost-governance-service.js';
import { createPricingTable } from '../pricing-table.js';
import type { IOpctlServiceForEnforcement } from '../cost-enforcement.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

type Handler = (payload: unknown) => void;

function createMockEventBus(): IEventBus & {
  handlers: Map<string, Handler[]>;
  publishCalls: Array<{ channel: string; payload: unknown }>;
  fire(channel: string, payload: unknown): void;
} {
  const handlers = new Map<string, Handler[]>();
  const publishCalls: Array<{ channel: string; payload: unknown }> = [];

  return {
    handlers,
    publishCalls,
    publish(channel: string, payload: unknown): void {
      publishCalls.push({ channel, payload });
    },
    subscribe(channel: string, handler: Handler): string {
      const list = handlers.get(channel) ?? [];
      list.push(handler);
      handlers.set(channel, list);
      return `sub-${channel}-${list.length}`;
    },
    unsubscribe(_id: string): void { /* no-op for tests */ },
    dispose(): void { /* no-op for tests */ },
    fire(channel: string, payload: unknown): void {
      const list = handlers.get(channel) ?? [];
      for (const h of list) h(payload);
    },
  } as IEventBus & {
    handlers: Map<string, Handler[]>;
    publishCalls: Array<{ channel: string; payload: unknown }>;
    fire(channel: string, payload: unknown): void;
  };
}

function createMockOpctlService(): IOpctlServiceForEnforcement {
  return {
    getProjectControlState: vi.fn().mockResolvedValue('running'),
    submitCommand: vi.fn().mockResolvedValue({
      status: 'applied',
      control_command_id: '00000000-0000-0000-0000-000000000000',
      target_ids_hash: 'a'.repeat(64),
    }),
  };
}

function makePayload(overrides: Partial<InferenceCallCompletePayload> = {}): InferenceCallCompletePayload {
  return {
    providerId: 'anthropic',
    modelId: 'claude-sonnet-4-20250514',
    traceId: 'trace-1',
    laneKey: 'lane-1',
    latencyMs: 100,
    emittedAt: new Date().toISOString(),
    projectId: 'project-1',
    inputTokens: 1000,
    outputTokens: 500,
    correlationRunId: 'run-1',
    ...overrides,
  };
}

function defaultPolicy(): BudgetPolicy {
  return {
    enabled: true,
    period: 'monthly',
    softThresholdPercent: 80,
    hardCeilingUsd: 100,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function createMockNotificationService() {
  const raiseCalls: Array<Record<string, unknown>> = [];
  return {
    raiseCalls,
    raise: vi.fn().mockImplementation((input: Record<string, unknown>) => {
      raiseCalls.push(input);
      return Promise.resolve({ id: `notif-${raiseCalls.length}` });
    }),
  } as unknown as INotificationService & { raiseCalls: Array<Record<string, unknown>> };
}

describe('CostGovernanceService', () => {
  let eventBus: ReturnType<typeof createMockEventBus>;
  let opctlService: ReturnType<typeof createMockOpctlService>;
  let notificationService: ReturnType<typeof createMockNotificationService>;
  let pricingTable: ReturnType<typeof createPricingTable>;
  let budgetPolicies: Map<string, BudgetPolicy>;
  let projectConfigs: Map<string, ProjectConfig>;
  let service: CostGovernanceService;

  beforeEach(() => {
    vi.useFakeTimers();
    eventBus = createMockEventBus();
    opctlService = createMockOpctlService();
    notificationService = createMockNotificationService();
    pricingTable = createPricingTable();
    budgetPolicies = new Map();
    projectConfigs = new Map();

    const deps: CostGovernanceServiceDeps = {
      eventBus: eventBus as unknown as IEventBus,
      opctlService,
      pricingTable,
      getProjectConfig: (pid: string) => {
        const config = projectConfigs.get(pid);
        if (config) return config;
        const policy = budgetPolicies.get(pid);
        return policy ? { budgetPolicy: policy } : undefined;
      },
      notificationService: notificationService as unknown as INotificationService,
      enforcementEnabled: false,
    };

    service = new CostGovernanceService(deps, { snapshotIntervalMs: 30_000 });
  });

  afterEach(() => {
    service.dispose();
    vi.useRealTimers();
  });

  // Test 1: Processes inference:call-complete
  it('processes inference:call-complete and emits cost:event-recorded', () => {
    eventBus.fire('inference:call-complete', makePayload());

    const recorded = eventBus.publishCalls.filter(c => c.channel === 'cost:event-recorded');
    expect(recorded).toHaveLength(1);
    const costEvent = recorded[0]!.payload as Record<string, unknown>;
    expect(costEvent.projectId).toBe('project-1');
    expect(costEvent.providerId).toBe('anthropic');
    expect(costEvent.modelId).toBe('claude-sonnet-4-20250514');
    expect(typeof costEvent.totalCostUsd).toBe('number');
    expect((costEvent.totalCostUsd as number)).toBeGreaterThan(0);
  });

  // Test 2: Processes inference:stream-complete
  it('processes inference:stream-complete through the same pipeline', () => {
    eventBus.fire('inference:stream-complete', makePayload());

    const recorded = eventBus.publishCalls.filter(c => c.channel === 'cost:event-recorded');
    expect(recorded).toHaveLength(1);
  });

  // Test 3: Pricing lookup correctness and pricing miss
  it('handles pricing miss with totalCostUsd=0 and pricingMiss=true', () => {
    eventBus.fire('inference:call-complete', makePayload({
      providerId: 'unknown-provider',
      modelId: 'unknown-model',
    }));

    const recorded = eventBus.publishCalls.filter(c => c.channel === 'cost:event-recorded');
    expect(recorded).toHaveLength(1);
    const costEvent = recorded[0]!.payload as Record<string, unknown>;
    expect(costEvent.totalCostUsd).toBe(0);
    expect(costEvent.pricingMiss).toBe(true);
  });

  // Test 4: Accumulation correctness (4 buckets)
  it('accumulates costs into 4 aggregation buckets correctly', () => {
    // Two events: different providers, same project
    eventBus.fire('inference:call-complete', makePayload({
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4-20250514',
      agentClass: 'Worker',
      correlationRunId: 'run-A',
      inputTokens: 1000,
      outputTokens: 500,
    }));
    eventBus.fire('inference:call-complete', makePayload({
      providerId: 'openai',
      modelId: 'gpt-4o',
      agentClass: 'Orchestrator',
      correlationRunId: 'run-B',
      inputTokens: 2000,
      outputTokens: 1000,
    }));

    // Project breakdown: single entry with total
    const projectBreakdown = service.getCostBreakdown('project-1', 'project');
    expect(projectBreakdown).toHaveLength(1);
    expect(projectBreakdown[0]!.totalCostUsd).toBeGreaterThan(0);
    expect(projectBreakdown[0]!.eventCount).toBe(2);

    // Provider breakdown: 2 entries
    const providerBreakdown = service.getCostBreakdown('project-1', 'provider');
    expect(providerBreakdown).toHaveLength(2);
    const anthropicEntry = providerBreakdown.find(e => e.key === 'anthropic:claude-sonnet-4-20250514');
    const openaiEntry = providerBreakdown.find(e => e.key === 'openai:gpt-4o');
    expect(anthropicEntry).toBeDefined();
    expect(openaiEntry).toBeDefined();

    // Agent class breakdown: 2 entries
    const agentBreakdown = service.getCostBreakdown('project-1', 'agentClass');
    expect(agentBreakdown).toHaveLength(2);
    expect(agentBreakdown.map(e => e.key).sort()).toEqual(['Orchestrator', 'Worker']);

    // Correlation root breakdown: 2 entries
    const correlationBreakdown = service.getCostBreakdown('project-1', 'correlationRoot');
    expect(correlationBreakdown).toHaveLength(2);
  });

  // Test 5: Correlation root — nested 3+ levels
  it('resolves correlation root across 3+ level chains', () => {
    // Event A: root (no parent)
    eventBus.fire('inference:call-complete', makePayload({
      correlationRunId: 'run-A',
      correlationParentId: undefined,
    }));
    // Event B: child of A
    eventBus.fire('inference:call-complete', makePayload({
      correlationRunId: 'run-B',
      correlationParentId: 'run-A',
    }));
    // Event C: child of B (grandchild of A)
    eventBus.fire('inference:call-complete', makePayload({
      correlationRunId: 'run-C',
      correlationParentId: 'run-B',
    }));

    const breakdown = service.getCostBreakdown('project-1', 'correlationRoot');
    // All 3 events should be attributed to root 'run-A'
    expect(breakdown).toHaveLength(1);
    expect(breakdown[0]!.key).toBe('run-A');
    expect(breakdown[0]!.eventCount).toBe(3);
  });

  // Test 6: Correlation root — single level and missing parent
  it('handles single-level correlation and missing parent fallback', () => {
    // No parent = self is root
    eventBus.fire('inference:call-complete', makePayload({
      correlationRunId: 'run-solo',
      correlationParentId: undefined,
    }));
    // Unknown parent: falls back to direct correlationRunId
    eventBus.fire('inference:call-complete', makePayload({
      correlationRunId: 'run-orphan',
      correlationParentId: 'run-unknown-parent',
    }));

    const breakdown = service.getCostBreakdown('project-1', 'correlationRoot');
    // 'run-solo' -> root is self, 'run-orphan' -> root is 'run-unknown-parent' (parent not found but chain end)
    expect(breakdown.length).toBeGreaterThanOrEqual(2);
  });

  // Test 7: Period boundary — monthly reset
  it('resets aggregation on monthly period boundary crossing', () => {
    budgetPolicies.set('project-1', defaultPolicy());

    // Emit event at end of month
    const jan31 = new Date(Date.UTC(2026, 0, 31, 23, 59, 0));
    vi.setSystemTime(jan31);

    // Re-create service with current time
    service.dispose();
    const deps: CostGovernanceServiceDeps = {
      eventBus: eventBus as unknown as IEventBus,
      opctlService,
      pricingTable,
      getProjectConfig: (pid: string) => {
        const policy = budgetPolicies.get(pid);
        return policy ? { budgetPolicy: policy } : undefined;
      },
      enforcementEnabled: false,
    };
    service = new CostGovernanceService(deps, { snapshotIntervalMs: 30_000 });

    eventBus.fire('inference:call-complete', makePayload({ inputTokens: 1000, outputTokens: 500 }));
    const statusBefore = service.getBudgetStatus('project-1');
    expect(statusBefore.currentSpendUsd).toBeGreaterThan(0);

    // Advance to Feb 1 (next period)
    const feb1 = new Date(Date.UTC(2026, 1, 1, 0, 0, 1));
    vi.setSystemTime(feb1);

    // Next event triggers period boundary check
    eventBus.fire('inference:call-complete', makePayload({ inputTokens: 100, outputTokens: 50 }));

    const statusAfter = service.getBudgetStatus('project-1');
    // The spend should be much less since accumulators were reset
    expect(statusAfter.currentSpendUsd).toBeLessThan(statusBefore.currentSpendUsd);
  });

  // Test 8: Period boundary — weekly reset
  it('resets aggregation on weekly period boundary crossing', () => {
    const weeklyPolicy: BudgetPolicy = { ...defaultPolicy(), period: 'weekly' };
    budgetPolicies.set('project-1', weeklyPolicy);

    // Monday
    const monday = new Date(Date.UTC(2026, 2, 30, 12, 0, 0)); // Monday Mar 30 2026
    vi.setSystemTime(monday);

    service.dispose();
    const deps: CostGovernanceServiceDeps = {
      eventBus: eventBus as unknown as IEventBus,
      opctlService,
      pricingTable,
      getProjectConfig: (pid: string) => {
        const policy = budgetPolicies.get(pid);
        return policy ? { budgetPolicy: policy } : undefined;
      },
      enforcementEnabled: false,
    };
    service = new CostGovernanceService(deps, { snapshotIntervalMs: 30_000 });

    eventBus.fire('inference:call-complete', makePayload({ inputTokens: 1000, outputTokens: 500 }));
    const statusBefore = service.getBudgetStatus('project-1');
    expect(statusBefore.currentSpendUsd).toBeGreaterThan(0);

    // Advance to next Monday
    const nextMonday = new Date(Date.UTC(2026, 3, 6, 0, 0, 1)); // Monday Apr 6 2026
    vi.setSystemTime(nextMonday);

    eventBus.fire('inference:call-complete', makePayload({ inputTokens: 100, outputTokens: 50 }));
    const statusAfter = service.getBudgetStatus('project-1');
    expect(statusAfter.currentSpendUsd).toBeLessThan(statusBefore.currentSpendUsd);
  });

  // Test 9: Budget soft threshold fires notification raise exactly once per period
  it('calls notificationService.raise with budget-warning exactly once per period at soft threshold', () => {
    budgetPolicies.set('project-1', {
      enabled: true,
      period: 'monthly',
      softThresholdPercent: 80,
      hardCeilingUsd: 1.0, // $1 ceiling so we can easily cross thresholds
    });

    // Send many events to push utilization above 80%
    // Claude Sonnet: $3/M input, $15/M output
    // 50K input + 10K output = $0.15 + $0.15 = $0.30 (30%)
    // 3 events = $0.90 (90% > 80%)
    for (let i = 0; i < 3; i++) {
      eventBus.fire('inference:call-complete', makePayload({
        inputTokens: 50_000,
        outputTokens: 10_000,
        correlationRunId: `run-${i}`,
      }));
    }

    const alerts = notificationService.raiseCalls.filter(
      (c: Record<string, unknown>) => c.kind === 'alert' && (c.alert as Record<string, unknown>)?.category === 'budget-warning',
    );
    expect(alerts).toHaveLength(1);

    // Additional event should NOT re-fire
    eventBus.fire('inference:call-complete', makePayload({
      inputTokens: 50_000,
      outputTokens: 10_000,
      correlationRunId: 'run-extra',
    }));
    const alertsAfter = notificationService.raiseCalls.filter(
      (c: Record<string, unknown>) => c.kind === 'alert' && (c.alert as Record<string, unknown>)?.category === 'budget-warning',
    );
    expect(alertsAfter).toHaveLength(1);
  });

  // Test 10: Budget hard ceiling fires notification raise once + enforcement
  it('calls notificationService.raise with budget-exceeded once and triggers enforcement at hard ceiling', async () => {
    // Re-build service with enforcementEnabled=true so the hard-ceiling path
    // submits to opctl. The default beforeEach builds with
    // enforcementEnabled=false (SP 2 ratified default); this test exercises
    // the enabled branch per SUPV-SP7-012.
    service.dispose();
    const enabledDeps: CostGovernanceServiceDeps = {
      eventBus: eventBus as unknown as IEventBus,
      opctlService,
      pricingTable,
      getProjectConfig: (pid: string) => {
        const config = projectConfigs.get(pid);
        if (config) return config;
        const policy = budgetPolicies.get(pid);
        return policy ? { budgetPolicy: policy } : undefined;
      },
      notificationService: notificationService as unknown as INotificationService,
      enforcementEnabled: true,
    };
    service = new CostGovernanceService(enabledDeps, { snapshotIntervalMs: 30_000 });

    budgetPolicies.set('project-1', {
      enabled: true,
      period: 'monthly',
      softThresholdPercent: 80,
      hardCeilingUsd: 0.5, // $0.50 ceiling
    });

    // Single large event to cross ceiling
    // 100K input + 50K output = $0.30 + $0.75 = $1.05 > $0.50
    eventBus.fire('inference:call-complete', makePayload({
      inputTokens: 100_000,
      outputTokens: 50_000,
    }));

    const exceeded = notificationService.raiseCalls.filter(
      (c: Record<string, unknown>) => c.kind === 'alert' && (c.alert as Record<string, unknown>)?.category === 'budget-exceeded',
    );
    expect(exceeded).toHaveLength(1);

    // Allow enforcement async to complete
    await vi.advanceTimersByTimeAsync(100);

    expect(opctlService.submitCommand).toHaveBeenCalled();

    // Second event should NOT re-fire
    eventBus.fire('inference:call-complete', makePayload({
      inputTokens: 100_000,
      outputTokens: 50_000,
      correlationRunId: 'run-2',
    }));
    const exceededAfter = notificationService.raiseCalls.filter(
      (c: Record<string, unknown>) => c.kind === 'alert' && (c.alert as Record<string, unknown>)?.category === 'budget-exceeded',
    );
    expect(exceededAfter).toHaveLength(1);
  });

  it('evaluateBudget works without notificationService (optional, no crash)', () => {
    // Create service without notificationService
    service.dispose();
    const deps: CostGovernanceServiceDeps = {
      eventBus: eventBus as unknown as IEventBus,
      opctlService,
      pricingTable,
      getProjectConfig: (pid: string) => {
        const policy = budgetPolicies.get(pid);
        return policy ? { budgetPolicy: policy } : undefined;
      },
      enforcementEnabled: false,
    };
    service = new CostGovernanceService(deps, { snapshotIntervalMs: 30_000 });

    budgetPolicies.set('project-1', {
      enabled: true,
      period: 'monthly',
      softThresholdPercent: 80,
      hardCeilingUsd: 0.01,
    });

    // Should not throw
    eventBus.fire('inference:call-complete', makePayload({ inputTokens: 1000, outputTokens: 500 }));
    expect(service.getBudgetStatus('project-1').hardCeilingFired).toBe(true);
  });

  // Test 11: setBudgetPolicy / removeBudgetPolicy
  it('resets hardCeilingFired when ceiling changes; removeBudgetPolicy keeps data', () => {
    budgetPolicies.set('project-1', {
      enabled: true,
      period: 'monthly',
      softThresholdPercent: 80,
      hardCeilingUsd: 0.01, // Very low ceiling
    });

    eventBus.fire('inference:call-complete', makePayload({ inputTokens: 1000, outputTokens: 500 }));
    let status = service.getBudgetStatus('project-1');
    expect(status.hardCeilingFired).toBe(true);

    // Change ceiling — should reset hardCeilingFired
    service.setBudgetPolicy('project-1', {
      enabled: true,
      period: 'monthly',
      softThresholdPercent: 80,
      hardCeilingUsd: 1000, // Very high ceiling
    });
    status = service.getBudgetStatus('project-1');
    expect(status.hardCeilingFired).toBe(false);
    // Spend data is preserved
    expect(status.currentSpendUsd).toBeGreaterThan(0);

    // Remove policy — cost data should remain
    const spendBefore = status.currentSpendUsd;
    service.removeBudgetPolicy('project-1');
    const breakdown = service.getCostBreakdown('project-1', 'project');
    expect(breakdown).toHaveLength(1);
    expect(breakdown[0]!.totalCostUsd).toBe(spendBefore);
  });

  // Test 12: Snapshot emission
  it('emits cost:snapshot every 30 seconds per active project', () => {
    eventBus.fire('inference:call-complete', makePayload());

    // Clear publish calls from event handling
    eventBus.publishCalls.length = 0;

    // Advance 30s
    vi.advanceTimersByTime(30_000);

    const snapshots = eventBus.publishCalls.filter(c => c.channel === 'cost:snapshot');
    expect(snapshots).toHaveLength(1);
    const snap = snapshots[0]!.payload as Record<string, unknown>;
    expect(snap.projectId).toBe('project-1');
    expect(typeof snap.totalSpendUsd).toBe('number');
    expect(typeof snap.byProvider).toBe('object');
    expect(typeof snap.byAgentClass).toBe('object');
  });

  // Test 13: getCostBreakdown all 4 groupBy values + getCostTimeSeries
  it('returns correct breakdown for all groupBy dimensions and time series', () => {
    eventBus.fire('inference:call-complete', makePayload({
      inputTokens: 1000,
      outputTokens: 500,
      correlationRunId: 'run-1',
      agentClass: 'Worker',
    }));

    // All 4 groupBy values should return data
    expect(service.getCostBreakdown('project-1', 'project')).toHaveLength(1);
    expect(service.getCostBreakdown('project-1', 'provider')).toHaveLength(1);
    expect(service.getCostBreakdown('project-1', 'agentClass')).toHaveLength(1);
    expect(service.getCostBreakdown('project-1', 'correlationRoot')).toHaveLength(1);

    // Time series with 60-min buckets
    const timeSeries = service.getCostTimeSeries('project-1', 60);
    expect(timeSeries.length).toBeGreaterThanOrEqual(1);
    expect(timeSeries[0]!.totalCostUsd).toBeGreaterThan(0);
    expect(timeSeries[0]!.eventCount).toBe(1);
  });

  // Test 14: getCostSummary + safe defaults
  it('returns correct summary with topProvider/topModel and handles safe defaults', () => {
    // Event with known provider
    eventBus.fire('inference:call-complete', makePayload({
      inputTokens: 1000,
      outputTokens: 500,
    }));

    const summary = service.getCostSummary('project-1');
    expect(summary.totalCostUsd).toBeGreaterThan(0);
    expect(summary.totalEvents).toBe(1);
    expect(summary.topProvider).toBe('anthropic:claude-sonnet-4-20250514');
    expect(summary.topModel).toBe('claude-sonnet-4-20250514');

    // Missing projectId defaults to '_system'
    eventBus.fire('inference:call-complete', makePayload({
      projectId: undefined,
      agentClass: undefined,
      inputTokens: undefined,
    }));

    const systemBreakdown = service.getCostBreakdown('_system', 'agentClass');
    expect(systemBreakdown.length).toBeGreaterThanOrEqual(1);
    const unknownAgent = systemBreakdown.find(e => e.key === 'Unknown');
    expect(unknownAgent).toBeDefined();

    // Non-existent project returns empty summary
    const emptySummary = service.getCostSummary('nonexistent');
    expect(emptySummary.totalCostUsd).toBe(0);
    expect(emptySummary.totalEvents).toBe(0);
  });

  // Test: dispose clears timer and unsubscribes
  it('dispose clears snapshot timer and unsubscribes from event bus', () => {
    service.dispose();

    // After dispose, advancing timers should not emit snapshots
    eventBus.publishCalls.length = 0;
    vi.advanceTimersByTime(60_000);
    const snapshots = eventBus.publishCalls.filter(c => c.channel === 'cost:snapshot');
    expect(snapshots).toHaveLength(0);
  });
});

describe('computePeriodBounds', () => {
  it('computes correct monthly bounds with exclusive end', () => {
    const jan15 = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));
    const { start, end } = computePeriodBounds(jan15, 'monthly');

    expect(start.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });

  it('computes correct weekly bounds with Monday start', () => {
    // Wednesday Apr 1 2026
    const wed = new Date(Date.UTC(2026, 3, 1, 12, 0, 0));
    const { start, end } = computePeriodBounds(wed, 'weekly');

    // Monday Mar 30 2026
    expect(start.getUTCDay()).toBe(1); // Monday
    // End should be next Monday
    expect(end.getTime() - start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('handles Dec 31 -> Jan 1 year rollover', () => {
    const dec31 = new Date(Date.UTC(2026, 11, 31, 23, 59, 59));
    const { start, end } = computePeriodBounds(dec31, 'monthly');

    expect(start.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});
