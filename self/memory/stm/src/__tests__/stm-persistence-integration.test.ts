/**
 * Integration test: STM persistence across sessions.
 *
 * Proves: conversation persists → close → reopen → conversation is there.
 */
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { DocumentStmStore } from '../document-stm-store.js';
import { SqliteDocumentStore } from '@nous/autonomic-storage';

describe('STM persistence integration', () => {
  it('conversation persists across store instances (simulates close/reopen)', async () => {
    const dbPath = join(tmpdir(), `nous-stm-persist-${randomUUID()}.sqlite`);
    const projectId = randomUUID();

    // First "session": create store, append entries
    const store1 = new DocumentStmStore(new SqliteDocumentStore(dbPath));
    await store1.append(projectId as any, {
      role: 'user',
      content: 'What is the capital of France?',
      timestamp: new Date().toISOString(),
    });
    await store1.append(projectId as any, {
      role: 'assistant',
      content: 'The capital of France is Paris.',
      timestamp: new Date().toISOString(),
    });

    const ctx1 = await store1.getContext(projectId as any);
    expect(ctx1.entries).toHaveLength(2);

    // "Close" — store1 goes out of scope. Create new store with same path (simulates reopen)
    const store2 = new DocumentStmStore(new SqliteDocumentStore(dbPath));
    const ctx2 = await store2.getContext(projectId as any);

    expect(ctx2.entries).toHaveLength(2);
    expect(ctx2.entries[0].content).toBe('What is the capital of France?');
    expect(ctx2.entries[1].content).toBe('The capital of France is Paris.');
  });
});
