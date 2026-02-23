/**
 * Integration tests for witness tRPC router.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { appRouter } from '../trpc/root';
import { clearNousContextCache, createNousContext } from '../bootstrap';

describe('witness router', () => {
  beforeAll(() => {
    process.env.NOUS_DATA_DIR = join(
      tmpdir(),
      `nous-witness-router-${randomUUID()}`,
    );
    clearNousContextCache();
  });

  it('createCheckpoint and latestCheckpoint operate through tRPC', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);

    const authorization = await ctx.witnessService.appendAuthorization({
      actionCategory: 'trace-persist',
      actionRef: 'checkpoint-trace',
      actor: 'core',
      status: 'approved',
      detail: {},
    });
    await ctx.witnessService.appendCompletion({
      actionCategory: 'trace-persist',
      actionRef: 'checkpoint-trace',
      authorizationRef: authorization.id,
      actor: 'core',
      status: 'succeeded',
      detail: {},
    });

    const checkpoint = await caller.witness.createCheckpoint({
      reason: 'manual',
    });
    const latest = await caller.witness.latestCheckpoint();

    expect(checkpoint.id).toBeTruthy();
    expect(latest?.id).toBe(checkpoint.id);
    expect(latest?.reason).toBe('manual');
  });

  it('rotateKeyEpoch updates active epoch and keeps verification functional', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);

    const nextEpoch = await caller.witness.rotateKeyEpoch();
    expect(nextEpoch).toBeGreaterThanOrEqual(2);

    const report = await caller.witness.verify({});
    expect(report.receipt.keyEpoch).toBe(nextEpoch);
    expect(report.receipt.verified).toBe(true);
  });

  it('verify reports fail when witness event chain is tampered', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);

    const authorization = await ctx.witnessService.appendAuthorization({
      actionCategory: 'model-invoke',
      actionRef: 'tamper-case',
      actor: 'core',
      status: 'approved',
      detail: {},
    });
    await ctx.witnessService.appendCompletion({
      actionCategory: 'model-invoke',
      actionRef: 'tamper-case',
      authorizationRef: authorization.id,
      actor: 'core',
      status: 'succeeded',
      detail: {},
    });

    const events = await ctx.documentStore.query<import('@nous/shared').WitnessEvent>(
      'witness_events',
      {
        orderBy: 'sequence',
        orderDirection: 'asc',
      },
    );
    const first = events[0];
    expect(first).toBeTruthy();
    if (first) {
      await ctx.documentStore.put('witness_events', first.id, {
        ...first,
        payloadHash: 'f'.repeat(64),
      });
    }

    const report = await caller.witness.verify({});
    expect(report.status).toBe('fail');
    expect(
      report.invariants.findings.some((finding) =>
        finding.code.startsWith('CHAIN-'),
      ),
    ).toBe(true);
  });

  it('verify links verificationReportId into trace evidence and supports trace-level report retrieval', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);

    const traceId = randomUUID() as import('@nous/shared').TraceId;
    await ctx.coreExecutor.executeTurn({
      message: 'link report to trace',
      traceId,
    });

    const report = await caller.witness.verify({});
    const trace = await caller.traces.get({ traceId });
    expect(trace).toBeTruthy();
    expect(
      trace?.turns.some((turn) =>
        turn.evidenceRefs.some(
          (ref) => ref.verificationReportId === report.id,
        ),
      ),
    ).toBe(true);

    const reports = await caller.traces.verificationReports({ traceId });
    expect(reports.some((entry) => entry.id === report.id)).toBe(true);
  });
});
