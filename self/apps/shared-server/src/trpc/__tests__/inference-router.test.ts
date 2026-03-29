import { describe, it, expect, vi } from 'vitest';
import { inferenceRouter } from '../routers/inference';
import type { NousContext } from '../../context';

// --- Helpers ---

function createMockContext(): NousContext {
  return {
    tokenAccumulator: {
      getUsageSummary: vi.fn().mockReturnValue({
        today: { inputTokens: 100, outputTokens: 50, callCount: 3, windowStart: '2026-03-28T00:00:00.000Z' },
        week: { inputTokens: 500, outputTokens: 250, callCount: 15, windowStart: '2026-03-24T00:00:00.000Z' },
        month: { inputTokens: 2000, outputTokens: 1000, callCount: 60, windowStart: '2026-03-01T00:00:00.000Z' },
      }),
      getProviderBreakdown: vi.fn().mockReturnValue([
        { providerId: 'provider-1', inputTokens: 80, outputTokens: 40, callCount: 2 },
        { providerId: 'provider-2', inputTokens: 20, outputTokens: 10, callCount: 1 },
      ]),
      dispose: vi.fn(),
    },
  } as unknown as NousContext;
}

describe('inference tRPC router', () => {
  it('getTokenUsageSummary returns correct { today, week, month } shape with WindowSummary fields', async () => {
    const ctx = createMockContext();
    const caller = inferenceRouter.createCaller(ctx);

    const result = await caller.getTokenUsageSummary();

    expect(result).toHaveProperty('today');
    expect(result).toHaveProperty('week');
    expect(result).toHaveProperty('month');

    expect(result.today).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      callCount: 3,
      windowStart: '2026-03-28T00:00:00.000Z',
    });
    expect(result.week.callCount).toBe(15);
    expect(result.month.callCount).toBe(60);
  });

  it('getProviderBreakdown returns ProviderBreakdownEntry[] shape', async () => {
    const ctx = createMockContext();
    const caller = inferenceRouter.createCaller(ctx);

    const result = await caller.getProviderBreakdown();

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      providerId: 'provider-1',
      inputTokens: 80,
      outputTokens: 40,
      callCount: 2,
    });
  });

  it('router wires correctly to ctx.tokenAccumulator methods', async () => {
    const ctx = createMockContext();
    const caller = inferenceRouter.createCaller(ctx);

    await caller.getTokenUsageSummary();
    expect(ctx.tokenAccumulator.getUsageSummary).toHaveBeenCalledOnce();

    await caller.getProviderBreakdown();
    expect(ctx.tokenAccumulator.getProviderBreakdown).toHaveBeenCalledOnce();
  });
});
