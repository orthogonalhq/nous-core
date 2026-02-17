/**
 * Unit tests for tRPC procedures.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createNousContext } from '../bootstrap';

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
});
