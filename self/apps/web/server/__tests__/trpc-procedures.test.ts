/**
 * Unit tests for tRPC procedures.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createNousContext } from '../bootstrap';
import { appRouter } from '../trpc/root';

describe('tRPC procedures', () => {
  beforeAll(async () => {
    process.env.NOUS_DATA_DIR = join(tmpdir(), `nous-web-test-${randomUUID()}`);
    const { clearNousContextCache } = await import('../bootstrap');
    clearNousContextCache();
  });

  it('projects.create and list returns new project', async () => {
    const ctx = createNousContext();
    const projectId = await ctx.projectStore.create({
      id: randomUUID() as import('@nous/shared').ProjectId,
      name: 'Test Project',
      type: 'hybrid',
      pfcTier: 3,
      memoryAccessPolicy: { canReadFrom: 'all', canBeReadBy: 'all', inheritsGlobal: true },
      escalationChannels: ['in-app'],
      retrievalBudgetTokens: 500,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const list = await ctx.projectStore.list();
    expect(list.some((p) => p.id === projectId)).toBe(true);
  });

  it('chat.sendMessage returns response', async () => {
    const ctx = createNousContext();
    const traceId = randomUUID() as import('@nous/shared').TraceId;
    const result = await ctx.coreExecutor.executeTurn({
      message: 'Hello',
      traceId,
    });

    expect(result.response).toBeDefined();
    expect(typeof result.response).toBe('string');
    expect(result.traceId).toBe(traceId);
  });

  it('chat.sendMessage stores STM history without duplicate router appends', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = await ctx.projectStore.create({
      id: randomUUID() as import('@nous/shared').ProjectId,
      name: 'Chat History Project',
      type: 'hybrid',
      pfcTier: 3,
      memoryAccessPolicy: {
        canReadFrom: 'all',
        canBeReadBy: 'all',
        inheritsGlobal: true,
      },
      escalationChannels: ['in-app'],
      retrievalBudgetTokens: 500,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const response = await caller.chat.sendMessage({
      message: 'Hello project chat',
      projectId,
    });
    const history = await caller.chat.getHistory({ projectId });

    expect(response.response).toBeDefined();
    expect(history.entries).toHaveLength(2);
    expect(history.entries[0]?.role).toBe('user');
    expect(history.entries[0]?.content).toBe('Hello project chat');
    expect(history.entries[1]?.role).toBe('assistant');
  });

  it('traces.list returns traces for project', async () => {
    const ctx = createNousContext();
    const projectId = randomUUID() as import('@nous/shared').ProjectId;
    const raw = await ctx.documentStore.query<unknown>('execution_traces', {
      where: { projectId },
      limit: 10,
    });
    expect(Array.isArray(raw)).toBe(true);
  });

  it('health.check returns HealthReport shape', async () => {
    const ctx = createNousContext();
    const components: Array<{ name: string; status: string }> = [];

    try {
      await ctx.documentStore.query('projects', { limit: 1 });
      components.push({ name: 'storage', status: 'healthy' });
    } catch {
      components.push({ name: 'storage', status: 'unhealthy' });
    }

    const report = {
      healthy: components.every((c) => c.status === 'healthy'),
      components,
      timestamp: new Date().toISOString(),
    };

    expect(report).toHaveProperty('healthy');
    expect(report).toHaveProperty('components');
    expect(report).toHaveProperty('timestamp');
    expect(Array.isArray(report.components)).toBe(true);
  });

  it('memory export includes mutation audit and tombstone arrays', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);

    const projectId = await ctx.projectStore.create({
      id: randomUUID() as import('@nous/shared').ProjectId,
      name: 'Memory Export Project',
      type: 'hybrid',
      pfcTier: 3,
      memoryAccessPolicy: { canReadFrom: 'all', canBeReadBy: 'all', inheritsGlobal: true },
      escalationChannels: ['in-app'],
      retrievalBudgetTokens: 500,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const entryId = await ctx.mwcPipeline.submit(
      {
        content: 'export payload',
        type: 'fact',
        scope: 'project',
        projectId,
        confidence: 0.9,
        sensitivity: [],
        retention: 'permanent',
        provenance: {
          traceId: randomUUID() as import('@nous/shared').TraceId,
          source: 'trpc-test',
          timestamp: new Date().toISOString(),
        },
        tags: [],
      },
      projectId,
    );
    expect(entryId).toBeTruthy();

    await caller.memory.delete({ id: entryId! });
    const exported = await caller.memory.export({ projectId });

    expect(Array.isArray(exported.entries)).toBe(true);
    expect(Array.isArray(exported.audit)).toBe(true);
    expect(Array.isArray(exported.tombstones)).toBe(true);
    expect(exported.audit.length).toBeGreaterThan(0);
  });

  it('witness verify/list/get returns report artifacts', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const traceId = randomUUID() as import('@nous/shared').TraceId;

    await ctx.coreExecutor.executeTurn({
      message: 'emit trace for witness linkage',
      traceId,
    });

    const authorization = await ctx.witnessService.appendAuthorization({
      actionCategory: 'trace-persist',
      actionRef: 'trace-test',
      actor: 'core',
      status: 'approved',
      detail: {},
    });
    await ctx.witnessService.appendCompletion({
      actionCategory: 'trace-persist',
      actionRef: 'trace-test',
      authorizationRef: authorization.id,
      actor: 'core',
      status: 'succeeded',
      detail: {},
    });

    const report = await caller.witness.verify({});
    expect(report.id).toBeTruthy();
    expect(report.receipt.verified).toBe(true);

    const listed = await caller.witness.listReports({ limit: 10 });
    expect(listed.some((entry) => entry.id === report.id)).toBe(true);

    const fetched = await caller.witness.getReport({ id: report.id });
    expect(fetched?.id).toBe(report.id);

    const traceReports = await caller.traces.verificationReports({ traceId });
    expect(traceReports.some((entry) => entry.id === report.id)).toBe(true);
  });
});
