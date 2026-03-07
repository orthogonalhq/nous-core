/**
 * Unit tests for DocumentStmStore.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { DocumentStmStore } from '../document-stm-store.js';
import { SqliteDocumentStore } from '@nous/autonomic-storage';
import { ValidationError } from '@nous/shared';

function createTempDbPath(): string {
  return join(tmpdir(), `nous-stm-test-${randomUUID()}.sqlite`);
}

describe('DocumentStmStore', () => {
  let documentStore: SqliteDocumentStore;
  let stmStore: DocumentStmStore;
  let projectId: string;

  beforeEach(() => {
    const dbPath = createTempDbPath();
    documentStore = new SqliteDocumentStore(dbPath);
    stmStore = new DocumentStmStore(documentStore);
    projectId = randomUUID();
  });

  it('implements IStmStore contract', async () => {
    const context = await stmStore.getContext(projectId as any);
    expect(context).toHaveProperty('entries');
    expect(context).toHaveProperty('tokenCount');
    expect(context).toHaveProperty('compactionState');
    expect(Array.isArray(context.entries)).toBe(true);
    expect(context.tokenCount).toBe(0);
  });

  it('getContext for non-existent project returns empty context', async () => {
    const context = await stmStore.getContext(projectId as any);
    expect(context.entries).toEqual([]);
    expect(context.tokenCount).toBe(0);
  });

  it('append then getContext returns entries', async () => {
    await stmStore.append(projectId as any, {
      role: 'user',
      content: 'Hello',
      timestamp: new Date().toISOString(),
    });
    await stmStore.append(projectId as any, {
      role: 'assistant',
      content: 'Hi there',
      timestamp: new Date().toISOString(),
    });

    const context = await stmStore.getContext(projectId as any);
    expect(context.entries).toHaveLength(2);
    expect(context.entries[0].role).toBe('user');
    expect(context.entries[0].content).toBe('Hello');
    expect(context.entries[1].role).toBe('assistant');
    expect(context.entries[1].content).toBe('Hi there');
  });

  it('tokenCount updated on append', async () => {
    await stmStore.append(projectId as any, {
      role: 'user',
      content: 'Hello world', // ~3 tokens (12 chars / 4)
      timestamp: new Date().toISOString(),
    });

    const context = await stmStore.getContext(projectId as any);
    expect(context.tokenCount).toBeGreaterThanOrEqual(1);
  });

  it('clear removes entries', async () => {
    await stmStore.append(projectId as any, {
      role: 'user',
      content: 'Test',
      timestamp: new Date().toISOString(),
    });
    await stmStore.clear(projectId as any);

    const context = await stmStore.getContext(projectId as any);
    expect(context.entries).toEqual([]);
    expect(context.tokenCount).toBe(0);
  });

  it('compact is no-op', async () => {
    await stmStore.append(projectId as any, {
      role: 'user',
      content: 'Test',
      timestamp: new Date().toISOString(),
    });
    await stmStore.compact(projectId as any);

    const context = await stmStore.getContext(projectId as any);
    expect(context.entries).toHaveLength(1);
  });

  it('compact summarizes older entries with provenance references', async () => {
    for (let i = 0; i < 10; i++) {
      await stmStore.append(projectId as any, {
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Entry ${i}`,
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
      });
    }

    await stmStore.compact(projectId as any);

    const context = await stmStore.getContext(projectId as any);
    expect(context.entries.length).toBeLessThan(10);
    expect(context.summary).toBeTruthy();

    const summaries = await documentStore.query<Record<string, unknown>>(
      'stm_compaction_summaries',
      { where: { projectId } },
    );
    expect(summaries.length).toBeGreaterThan(0);
    const summary = summaries[0] as {
      sourceEntryRefs?: unknown[];
      sourceEntryCount?: number;
      trigger?: unknown;
      preCompactionTokenCount?: unknown;
      postCompactionTokenCount?: unknown;
      retainedEntryCount?: unknown;
    };
    expect(Array.isArray(summary.sourceEntryRefs)).toBe(true);
    expect(summary.sourceEntryCount).toBeGreaterThan(0);
    expect(summary.trigger).toBe('manual');
    expect(summary.preCompactionTokenCount).toEqual(expect.any(Number));
    expect(summary.postCompactionTokenCount).toEqual(expect.any(Number));
    expect(summary.retainedEntryCount).toBe(4);
  });

  it('marks compactionState when configured token threshold is exceeded', async () => {
    const thresholdStore = new DocumentStmStore(documentStore, {
      compactionPolicy: {
        maxContextTokens: 12,
        targetContextTokens: 8,
        minEntriesBeforeCompaction: 3,
        retainedRecentEntries: 1,
      },
    });

    await thresholdStore.append(projectId as any, {
      role: 'user',
      content: 'one two three four',
      timestamp: new Date().toISOString(),
    });
    await thresholdStore.append(projectId as any, {
      role: 'assistant',
      content: 'five six seven eight',
      timestamp: new Date().toISOString(),
    });
    await thresholdStore.append(projectId as any, {
      role: 'user',
      content: 'nine ten eleven twelve',
      timestamp: new Date().toISOString(),
    });

    const context = await thresholdStore.getContext(projectId as any);
    expect(context.compactionState?.requiresCompaction).toBe(true);
    expect(context.compactionState?.trigger).toBe('token-threshold');
  });

  it('compacts to the configured target budget when thresholds are exceeded', async () => {
    const thresholdStore = new DocumentStmStore(documentStore, {
      compactionPolicy: {
        maxContextTokens: 12,
        targetContextTokens: 8,
        minEntriesBeforeCompaction: 4,
        retainedRecentEntries: 2,
      },
    });

    for (let i = 0; i < 6; i++) {
      await thresholdStore.append(projectId as any, {
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Entry ${i} text`,
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
      });
    }

    const before = await thresholdStore.getContext(projectId as any);
    expect(before.compactionState?.requiresCompaction).toBe(true);

    await thresholdStore.compact(projectId as any);

    const after = await thresholdStore.getContext(projectId as any);
    expect(after.entries).toHaveLength(2);
    expect(after.tokenCount).toBeLessThanOrEqual(8);
    expect(after.compactionState?.requiresCompaction).toBe(false);
  });

  it('rejects invalid role', async () => {
    await expect(
      stmStore.append(projectId as any, {
        role: 'invalid' as any,
        content: 'Test',
        timestamp: new Date().toISOString(),
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('project-scoped: different projects have separate context', async () => {
    const projectId2 = randomUUID();
    await stmStore.append(projectId as any, {
      role: 'user',
      content: 'Project 1',
      timestamp: new Date().toISOString(),
    });
    await stmStore.append(projectId2 as any, {
      role: 'user',
      content: 'Project 2',
      timestamp: new Date().toISOString(),
    });

    const ctx1 = await stmStore.getContext(projectId as any);
    const ctx2 = await stmStore.getContext(projectId2 as any);
    expect(ctx1.entries[0].content).toBe('Project 1');
    expect(ctx2.entries[0].content).toBe('Project 2');
  });
});
