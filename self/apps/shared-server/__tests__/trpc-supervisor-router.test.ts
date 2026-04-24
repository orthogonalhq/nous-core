/**
 * WR-162 SP 6 — Supervisor tRPC router tests (UT-TR1..UT-TR8).
 *
 * Per SUPV-SP6-006: three publicProcedure queries pass through to
 * `ctx.supervisorService`. Input validation uses Zod at the tRPC boundary
 * (non-UUID projectId, limit > 200, non-ISO since) → rejects before service.
 */
import { describe, it, expect, vi } from 'vitest';
import { supervisorRouter } from '../src/trpc/routers/supervisor';
import type { NousContext } from '../src/context';

function mkCtx(overrides?: {
  getRecentViolations?: ReturnType<typeof vi.fn>;
  getStatusSnapshot?: ReturnType<typeof vi.fn>;
  getSentinelRiskScores?: ReturnType<typeof vi.fn>;
}): NousContext {
  const empty = vi.fn().mockResolvedValue([]);
  const emptySnap = vi.fn().mockResolvedValue({
    active: false,
    agentsMonitored: 0,
    activeViolationCounts: { s0: 0, s1: 0, s2: 0, s3: 0 },
    lifetime: {
      violationsDetected: 0,
      anomaliesClassified: 0,
      enforcementsApplied: 0,
    },
    witnessIntegrity: 'intact',
    riskSummary: {},
    reportedAt: '2026-04-24T00:00:00.000Z',
  });
  return {
    supervisorService: {
      getRecentViolations: overrides?.getRecentViolations ?? empty,
      getStatusSnapshot: overrides?.getStatusSnapshot ?? emptySnap,
      getSentinelRiskScores: overrides?.getSentinelRiskScores ?? empty,
    },
  } as unknown as NousContext;
}

const caller = (ctx: NousContext) => supervisorRouter.createCaller(ctx);

describe('UT-TR1..UT-TR3 — supervisor router happy paths', () => {
  it('UT-TR1 — getRecentViolations returns [] on empty dev setup', async () => {
    const ctx = mkCtx();
    const result = await caller(ctx).getRecentViolations({});
    expect(result).toEqual([]);
  });

  it('UT-TR2 — getSupervisorStatus returns schema-valid snapshot', async () => {
    const ctx = mkCtx();
    const snap = await caller(ctx).getSupervisorStatus();
    expect(snap).toHaveProperty('active');
    expect(snap).toHaveProperty('lifetime');
    expect(snap).toHaveProperty('riskSummary');
  });

  it('UT-TR3 — getSentinelRiskScores returns [] on empty dev setup', async () => {
    const ctx = mkCtx();
    const result = await caller(ctx).getSentinelRiskScores({});
    expect(result).toEqual([]);
  });
});

describe('UT-TR4..UT-TR6 — input validation rejects malformed input', () => {
  const ctx = mkCtx();

  it('UT-TR4 — non-UUID projectId rejected', async () => {
    await expect(
      caller(ctx).getRecentViolations({ projectId: 'not-a-uuid' }),
    ).rejects.toThrow();
  });

  it('UT-TR5 — limit > 200 rejected', async () => {
    await expect(
      caller(ctx).getRecentViolations({ limit: 201 }),
    ).rejects.toThrow();
  });

  it('UT-TR6 — non-ISO-8601 since rejected', async () => {
    await expect(
      caller(ctx).getRecentViolations({ since: 'not-iso-8601' }),
    ).rejects.toThrow();
  });

  it('UT-TR4b — non-UUID projectId rejected on getSentinelRiskScores', async () => {
    await expect(
      caller(ctx).getSentinelRiskScores({ projectId: 'bad' }),
    ).rejects.toThrow();
  });
});

describe('UT-TR7..UT-TR8 — service input pass-through', () => {
  it('UT-TR7 — limit + since filter pass-through', async () => {
    const spy = vi.fn().mockResolvedValue([]);
    const ctx = mkCtx({ getRecentViolations: spy });
    await caller(ctx).getRecentViolations({ limit: 3, since: '2026-04-01T00:00:00.000Z' });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 3, since: '2026-04-01T00:00:00.000Z' }),
    );
  });

  it('UT-TR8 — projectId UUID pass-through', async () => {
    const spy = vi.fn().mockResolvedValue([]);
    const ctx = mkCtx({ getSentinelRiskScores: spy });
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    await caller(ctx).getSentinelRiskScores({ projectId: uuid });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ projectId: uuid }));
  });
});
