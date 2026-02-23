/**
 * Integration tests for memory tRPC router with governed mutation flows.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ProjectConfig } from '@nous/shared';
import { appRouter } from '../trpc/root';
import { clearNousContextCache, createNousContext } from '../bootstrap';

function createProjectConfig(): ProjectConfig {
  const now = new Date().toISOString();
  return {
    id: randomUUID() as import('@nous/shared').ProjectId,
    name: 'Memory Router Test Project',
    type: 'hybrid',
    pfcTier: 3,
    memoryAccessPolicy: {
      canReadFrom: 'all',
      canBeReadBy: 'all',
      inheritsGlobal: true,
    },
    escalationChannels: ['in-app'],
    retrievalBudgetTokens: 500,
    createdAt: now,
    updatedAt: now,
  };
}

function createCandidate(
  projectId: import('@nous/shared').ProjectId,
  content: string,
) {
  return {
    content,
    type: 'preference' as const,
    scope: 'project' as const,
    projectId,
    confidence: 0.9,
    sensitivity: [],
    retention: 'permanent' as const,
    provenance: {
      traceId: randomUUID() as import('@nous/shared').TraceId,
      source: 'memory-router-test',
      timestamp: new Date().toISOString(),
    },
    tags: ['router-test'],
  };
}

describe('memory router', () => {
  beforeAll(() => {
    process.env.NOUS_DATA_DIR = join(tmpdir(), `nous-memory-router-${randomUUID()}`);
    clearNousContextCache();
  });

  it('soft delete routes through governed mutation and records audit entries', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = await ctx.projectStore.create(createProjectConfig());
    const entryId = await ctx.mwcPipeline.submit(
      createCandidate(projectId, 'soft delete me'),
      projectId,
    );
    expect(entryId).toBeTruthy();

    const deletion = await caller.memory.delete({ id: entryId! });
    expect(deletion.deleted).toBe(1);

    const list = await caller.memory.list({ projectId });
    expect(list).toHaveLength(1);
    expect(list[0].lifecycleStatus).toBe('soft-deleted');

    const audit = await caller.memory.audit({ projectId });
    expect(
      audit.some(
        (item) => item.action === 'soft-delete' && item.outcome === 'applied',
      ),
    ).toBe(true);
  });

  it('hard delete requires rationale and emits tombstone', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = await ctx.projectStore.create(createProjectConfig());
    const entryId = await ctx.mwcPipeline.submit(
      createCandidate(projectId, 'hard delete me'),
      projectId,
    );
    expect(entryId).toBeTruthy();

    const denied = await caller.memory.delete({ id: entryId!, hard: true });
    expect(denied.deleted).toBe(0);

    const approved = await caller.memory.delete({
      id: entryId!,
      hard: true,
      rationale: 'principal approved erase',
    });
    expect(approved.deleted).toBe(1);

    const list = await caller.memory.list({ projectId });
    expect(list[0].lifecycleStatus).toBe('hard-deleted');
    expect(list[0].tombstoneId).toBeTruthy();
    expect(list[0].content).toBe('[hard-deleted]');

    const tombstones = await caller.memory.tombstones({ projectId });
    expect(tombstones).toHaveLength(1);
    expect(tombstones[0].targetEntryId).toBe(entryId);
  });

  it('supersede mutation updates lineage using supersededBy', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = await ctx.projectStore.create(createProjectConfig());
    const oldEntryId = await ctx.mwcPipeline.submit(
      createCandidate(projectId, 'original content'),
      projectId,
    );
    expect(oldEntryId).toBeTruthy();

    const replacement = createCandidate(projectId, 'replacement content');
    const result = await caller.memory.supersede({
      id: oldEntryId!,
      replacement,
      projectId,
    });
    expect(result.applied).toBe(true);
    expect(result.resultingEntryId).toBeTruthy();

    const list = await caller.memory.list({ projectId });
    const original = list.find((entry) => entry.id === oldEntryId);
    const next = list.find((entry) => entry.id === result.resultingEntryId);

    expect(original?.lifecycleStatus).toBe('superseded');
    expect(original?.supersededBy).toBe(result.resultingEntryId);
    expect(next?.lifecycleStatus).toBe('active');
  });
});
