/**
 * Unit tests for first-run tRPC procedures.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createNousContext, clearNousContextCache } from '../bootstrap';
import { isFirstRunComplete, markFirstRunComplete } from '../first-run';

describe('first-run procedures', () => {
  beforeAll(() => {
    process.env.NOUS_DATA_DIR = join(tmpdir(), `nous-first-run-test-${randomUUID()}`);
    clearNousContextCache();
  });

  it('firstRun.status returns { complete: boolean }', async () => {
    const ctx = createNousContext();
    const complete = await isFirstRunComplete(ctx.dataDir, ctx.projectStore);
    expect(typeof complete).toBe('boolean');
  });

  it('firstRun.complete writes flag, then status returns true', async () => {
    const ctx = createNousContext();
    const before = await isFirstRunComplete(ctx.dataDir, ctx.projectStore);
    expect(before).toBe(false);

    markFirstRunComplete(ctx.dataDir);

    const after = await isFirstRunComplete(ctx.dataDir, ctx.projectStore);
    expect(after).toBe(true);
  });
});
