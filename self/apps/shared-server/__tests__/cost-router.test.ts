import { describe, it, expect, vi } from 'vitest';
import { costRouter } from '../src/trpc/routers/cost';
import type { NousContext } from '../src/context';

// --- Helpers ---

function createMockContext(overrides?: {
  getBudgetPolicy?: ReturnType<typeof vi.fn>;
  setBudgetPolicy?: ReturnType<typeof vi.fn>;
  removeBudgetPolicy?: ReturnType<typeof vi.fn>;
  getBudgetStatus?: ReturnType<typeof vi.fn>;
  getCostBreakdown?: ReturnType<typeof vi.fn>;
  getCostTimeSeries?: ReturnType<typeof vi.fn>;
  getCostSummary?: ReturnType<typeof vi.fn>;
  getProjectControlState?: ReturnType<typeof vi.fn>;
}): NousContext {
  return {
    costGovernanceService: {
      getBudgetPolicy: overrides?.getBudgetPolicy ?? vi.fn().mockReturnValue(null),
      setBudgetPolicy: overrides?.setBudgetPolicy ?? vi.fn(),
      removeBudgetPolicy: overrides?.removeBudgetPolicy ?? vi.fn(),
      getBudgetStatus: overrides?.getBudgetStatus ?? vi.fn().mockReturnValue({
        hasBudget: false,
        currentSpendUsd: 0,
        budgetCeilingUsd: 0,
        utilizationPercent: 0,
        softAlertFired: false,
        hardCeilingFired: false,
        periodStart: '2026-04-01T00:00:00.000Z',
        periodEnd: '2026-04-30T23:59:59.999Z',
        projectControlState: 'running',
      }),
      getCostBreakdown: overrides?.getCostBreakdown ?? vi.fn().mockReturnValue([]),
      getCostTimeSeries: overrides?.getCostTimeSeries ?? vi.fn().mockReturnValue([]),
      getCostSummary: overrides?.getCostSummary ?? vi.fn().mockReturnValue({
        totalCostUsd: 0,
        totalInputCostUsd: 0,
        totalOutputCostUsd: 0,
        totalEvents: 0,
        periodStart: '2026-04-01T00:00:00.000Z',
        periodEnd: '2026-04-30T23:59:59.999Z',
      }),
    },
    opctlService: {
      getProjectControlState: overrides?.getProjectControlState ?? vi.fn().mockResolvedValue('running'),
    },
  } as unknown as NousContext;
}

const samplePolicy = {
  enabled: true,
  period: 'monthly' as const,
  softThresholdPercent: 80,
  hardCeilingUsd: 100,
};

// --- Tier 1: Contract Tests ---

describe('cost tRPC router — contract tests', () => {
  it('getBudgetPolicy returns BudgetPolicy for project with policy', async () => {
    const ctx = createMockContext({
      getBudgetPolicy: vi.fn().mockReturnValue(samplePolicy),
    });
    const caller = costRouter.createCaller(ctx);

    const result = await caller.getBudgetPolicy({ projectId: 'proj-1' });

    expect(result).toEqual(samplePolicy);
  });

  it('getBudgetPolicy returns null for project with no policy', async () => {
    const ctx = createMockContext();
    const caller = costRouter.createCaller(ctx);

    const result = await caller.getBudgetPolicy({ projectId: 'proj-1' });

    expect(result).toBeNull();
  });

  it('setBudgetPolicy returns { success: true }', async () => {
    const ctx = createMockContext();
    const caller = costRouter.createCaller(ctx);

    const result = await caller.setBudgetPolicy({
      projectId: 'proj-1',
      policy: samplePolicy,
    });

    expect(result).toEqual({ success: true });
  });

  it('removeBudgetPolicy returns { success: true }', async () => {
    const ctx = createMockContext();
    const caller = costRouter.createCaller(ctx);

    const result = await caller.removeBudgetPolicy({ projectId: 'proj-1' });

    expect(result).toEqual({ success: true });
  });

  it('getBudgetStatus returns valid BudgetStatus shape', async () => {
    const ctx = createMockContext();
    const caller = costRouter.createCaller(ctx);

    const result = await caller.getBudgetStatus({ projectId: 'proj-1' });

    expect(result).toHaveProperty('hasBudget');
    expect(result).toHaveProperty('currentSpendUsd');
    expect(result).toHaveProperty('budgetCeilingUsd');
    expect(result).toHaveProperty('utilizationPercent');
    expect(result).toHaveProperty('softAlertFired');
    expect(result).toHaveProperty('hardCeilingFired');
    expect(result).toHaveProperty('periodStart');
    expect(result).toHaveProperty('periodEnd');
    expect(result).toHaveProperty('projectControlState');
  });

  it('getCostBreakdown returns CostBreakdownEntry[]', async () => {
    const entries = [
      { key: 'anthropic:claude-3', totalCostUsd: 1.5, inputCostUsd: 1.0, outputCostUsd: 0.5, eventCount: 3 },
    ];
    const ctx = createMockContext({
      getCostBreakdown: vi.fn().mockReturnValue(entries),
    });
    const caller = costRouter.createCaller(ctx);

    const result = await caller.getCostBreakdown({ projectId: 'proj-1', groupBy: 'provider' });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(entries[0]);
  });

  it('getCostTimeSeries returns CostTimeSeriesBucket[]', async () => {
    const buckets = [
      { bucketStart: '2026-04-01T00:00:00.000Z', totalCostUsd: 0.5, eventCount: 2 },
    ];
    const ctx = createMockContext({
      getCostTimeSeries: vi.fn().mockReturnValue(buckets),
    });
    const caller = costRouter.createCaller(ctx);

    const result = await caller.getCostTimeSeries({ projectId: 'proj-1', bucketMinutes: 60 });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(buckets[0]);
  });

  it('getCostSummary returns valid CostSummary shape', async () => {
    const summary = {
      totalCostUsd: 5.0,
      totalInputCostUsd: 3.0,
      totalOutputCostUsd: 2.0,
      totalEvents: 10,
      periodStart: '2026-04-01T00:00:00.000Z',
      periodEnd: '2026-04-30T23:59:59.999Z',
      topProvider: 'anthropic:claude-3',
      topModel: 'claude-3',
    };
    const ctx = createMockContext({
      getCostSummary: vi.fn().mockReturnValue(summary),
    });
    const caller = costRouter.createCaller(ctx);

    const result = await caller.getCostSummary({ projectId: 'proj-1' });

    expect(result).toEqual(summary);
  });
});

// --- Tier 2: Behavior Tests ---

describe('cost tRPC router — behavior tests', () => {
  it('setBudgetPolicy delegates with correct args', async () => {
    const setBudgetPolicy = vi.fn();
    const ctx = createMockContext({ setBudgetPolicy });
    const caller = costRouter.createCaller(ctx);

    await caller.setBudgetPolicy({ projectId: 'proj-1', policy: samplePolicy });

    expect(setBudgetPolicy).toHaveBeenCalledWith('proj-1', samplePolicy);
  });

  it('removeBudgetPolicy delegates with correct args', async () => {
    const removeBudgetPolicy = vi.fn();
    const ctx = createMockContext({ removeBudgetPolicy });
    const caller = costRouter.createCaller(ctx);

    await caller.removeBudgetPolicy({ projectId: 'proj-1' });

    expect(removeBudgetPolicy).toHaveBeenCalledWith('proj-1');
  });

  it('getBudgetStatus enriches projectControlState from opctl', async () => {
    const getBudgetStatus = vi.fn().mockReturnValue({
      hasBudget: true,
      currentSpendUsd: 50,
      budgetCeilingUsd: 100,
      utilizationPercent: 50,
      softAlertFired: false,
      hardCeilingFired: false,
      periodStart: '2026-04-01T00:00:00.000Z',
      periodEnd: '2026-04-30T23:59:59.999Z',
      projectControlState: 'running',
    });
    const getProjectControlState = vi.fn().mockResolvedValue('paused');
    const ctx = createMockContext({ getBudgetStatus, getProjectControlState });
    const caller = costRouter.createCaller(ctx);

    const result = await caller.getBudgetStatus({ projectId: 'proj-1' });

    expect(result.projectControlState).toBe('paused');
    expect(getProjectControlState).toHaveBeenCalled();
  });

  it('getBudgetStatus falls back to running when opctl throws', async () => {
    const getBudgetStatus = vi.fn().mockReturnValue({
      hasBudget: true,
      currentSpendUsd: 50,
      budgetCeilingUsd: 100,
      utilizationPercent: 50,
      softAlertFired: false,
      hardCeilingFired: false,
      periodStart: '2026-04-01T00:00:00.000Z',
      periodEnd: '2026-04-30T23:59:59.999Z',
      projectControlState: 'running',
    });
    const getProjectControlState = vi.fn().mockRejectedValue(new Error('opctl unavailable'));
    const ctx = createMockContext({ getBudgetStatus, getProjectControlState });
    const caller = costRouter.createCaller(ctx);

    const result = await caller.getBudgetStatus({ projectId: 'proj-1' });

    expect(result.projectControlState).toBe('running');
  });

  it('getCostBreakdown with groupBy provider delegates directly', async () => {
    const entries = [
      { key: 'anthropic:claude-3', totalCostUsd: 1.0, inputCostUsd: 0.6, outputCostUsd: 0.4, eventCount: 2 },
    ];
    const getCostBreakdown = vi.fn().mockReturnValue(entries);
    const ctx = createMockContext({ getCostBreakdown });
    const caller = costRouter.createCaller(ctx);

    await caller.getCostBreakdown({ projectId: 'proj-1', groupBy: 'provider' });

    expect(getCostBreakdown).toHaveBeenCalledWith('proj-1', 'provider');
  });

  it('getCostBreakdown with groupBy model extracts model from composite keys and re-aggregates', async () => {
    const compositeEntries = [
      { key: 'anthropic:claude-3', totalCostUsd: 1.0, inputCostUsd: 0.6, outputCostUsd: 0.4, eventCount: 2 },
      { key: 'openai:gpt-4', totalCostUsd: 2.0, inputCostUsd: 1.2, outputCostUsd: 0.8, eventCount: 3 },
    ];
    const getCostBreakdown = vi.fn().mockReturnValue(compositeEntries);
    const ctx = createMockContext({ getCostBreakdown });
    const caller = costRouter.createCaller(ctx);

    const result = await caller.getCostBreakdown({ projectId: 'proj-1', groupBy: 'model' });

    // Should call service with 'provider' to get composite keys
    expect(getCostBreakdown).toHaveBeenCalledWith('proj-1', 'provider');
    expect(result).toHaveLength(2);
    expect(result.find(e => e.key === 'claude-3')).toEqual({
      key: 'claude-3',
      totalCostUsd: 1.0,
      inputCostUsd: 0.6,
      outputCostUsd: 0.4,
      eventCount: 2,
    });
    expect(result.find(e => e.key === 'gpt-4')).toEqual({
      key: 'gpt-4',
      totalCostUsd: 2.0,
      inputCostUsd: 1.2,
      outputCostUsd: 0.8,
      eventCount: 3,
    });
  });

  it('getCostBreakdown with groupBy agentClass delegates directly', async () => {
    const getCostBreakdown = vi.fn().mockReturnValue([]);
    const ctx = createMockContext({ getCostBreakdown });
    const caller = costRouter.createCaller(ctx);

    await caller.getCostBreakdown({ projectId: 'proj-1', groupBy: 'agentClass' });

    expect(getCostBreakdown).toHaveBeenCalledWith('proj-1', 'agentClass');
  });

  it('getCostBreakdown with groupBy correlationRoot delegates directly', async () => {
    const getCostBreakdown = vi.fn().mockReturnValue([]);
    const ctx = createMockContext({ getCostBreakdown });
    const caller = costRouter.createCaller(ctx);

    await caller.getCostBreakdown({ projectId: 'proj-1', groupBy: 'correlationRoot' });

    expect(getCostBreakdown).toHaveBeenCalledWith('proj-1', 'correlationRoot');
  });
});

// --- Tier 3: Edge Cases ---

describe('cost tRPC router — edge cases', () => {
  it('getCostBreakdown groupBy model handles model ID containing colons', async () => {
    const compositeEntries = [
      { key: 'anthropic:claude:3:sonnet', totalCostUsd: 1.0, inputCostUsd: 0.6, outputCostUsd: 0.4, eventCount: 2 },
    ];
    const getCostBreakdown = vi.fn().mockReturnValue(compositeEntries);
    const ctx = createMockContext({ getCostBreakdown });
    const caller = costRouter.createCaller(ctx);

    const result = await caller.getCostBreakdown({ projectId: 'proj-1', groupBy: 'model' });

    expect(result).toHaveLength(1);
    expect(result[0]!.key).toBe('claude:3:sonnet');
  });

  it('getCostBreakdown groupBy model re-aggregates entries from multiple providers with same model', async () => {
    const compositeEntries = [
      { key: 'provider-a:shared-model', totalCostUsd: 1.0, inputCostUsd: 0.6, outputCostUsd: 0.4, eventCount: 2 },
      { key: 'provider-b:shared-model', totalCostUsd: 3.0, inputCostUsd: 1.8, outputCostUsd: 1.2, eventCount: 5 },
    ];
    const getCostBreakdown = vi.fn().mockReturnValue(compositeEntries);
    const ctx = createMockContext({ getCostBreakdown });
    const caller = costRouter.createCaller(ctx);

    const result = await caller.getCostBreakdown({ projectId: 'proj-1', groupBy: 'model' });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      key: 'shared-model',
      totalCostUsd: 4.0,
      inputCostUsd: 2.4,
      outputCostUsd: 1.6,
      eventCount: 7,
    });
  });

  it('getCostTimeSeries with empty result returns []', async () => {
    const ctx = createMockContext({
      getCostTimeSeries: vi.fn().mockReturnValue([]),
    });
    const caller = costRouter.createCaller(ctx);

    const result = await caller.getCostTimeSeries({ projectId: 'proj-1', bucketMinutes: 60 });

    expect(result).toEqual([]);
  });

  it('getCostSummary with no data returns zero-valued summary', async () => {
    const ctx = createMockContext();
    const caller = costRouter.createCaller(ctx);

    const result = await caller.getCostSummary({ projectId: 'proj-1' });

    expect(result.totalCostUsd).toBe(0);
    expect(result.totalEvents).toBe(0);
  });

  it('getCostSummary topProvider and topModel reflect highest cost', async () => {
    const summary = {
      totalCostUsd: 10.0,
      totalInputCostUsd: 6.0,
      totalOutputCostUsd: 4.0,
      totalEvents: 5,
      periodStart: '2026-04-01T00:00:00.000Z',
      periodEnd: '2026-04-30T23:59:59.999Z',
      topProvider: 'anthropic:claude-3-opus',
      topModel: 'claude-3-opus',
    };
    const ctx = createMockContext({
      getCostSummary: vi.fn().mockReturnValue(summary),
    });
    const caller = costRouter.createCaller(ctx);

    const result = await caller.getCostSummary({ projectId: 'proj-1' });

    expect(result.topProvider).toBe('anthropic:claude-3-opus');
    expect(result.topModel).toBe('claude-3-opus');
  });
});
