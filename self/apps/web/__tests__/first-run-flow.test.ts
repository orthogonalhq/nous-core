/**
 * Integration test: first-run flow — complete steps, mark complete, redirect.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createNousContext, clearNousContextCache } from '../server/bootstrap';
import { isFirstRunComplete, markFirstRunComplete } from '../server/first-run';

describe('first-run flow', () => {
  beforeAll(() => {
    process.env.NOUS_DATA_DIR = join(tmpdir(), `nous-first-run-flow-${randomUUID()}`);
    clearNousContextCache();
  });

  it('first-run flow: status incomplete → complete → status complete', async () => {
    const ctx = createNousContext();

    const before = await isFirstRunComplete(ctx.dataDir, ctx.projectStore);
    expect(before).toBe(false);

    markFirstRunComplete(ctx.dataDir);

    const after = await isFirstRunComplete(ctx.dataDir, ctx.projectStore);
    expect(after).toBe(true);
  });

  it('project count > 0 treats first-run as complete', async () => {
    process.env.NOUS_DATA_DIR = join(tmpdir(), `nous-first-run-flow-2-${randomUUID()}`);
    clearNousContextCache();

    const ctx = createNousContext();

    await ctx.projectStore.create({
      id: randomUUID() as import('@nous/shared').ProjectId,
      name: 'Test',
      type: 'hybrid',
      pfcTier: 3,
      memoryAccessPolicy: { canReadFrom: 'all', canBeReadBy: 'all', inheritsGlobal: true },
      escalationChannels: ['in-app'],
      retrievalBudgetTokens: 500,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const complete = await isFirstRunComplete(ctx.dataDir, ctx.projectStore);
    expect(complete).toBe(true);
  });
});
