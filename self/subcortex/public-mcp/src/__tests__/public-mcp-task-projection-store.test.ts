import { describe, expect, it } from 'vitest';
import { PublicMcpTaskProjectionStore } from '../public-mcp-task-projection-store.js';
import { createMemoryDocumentStore } from './test-store.js';

const SUBJECT = {
  clientId: 'client-1',
  namespace: 'app:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
};

describe('PublicMcpTaskProjectionStore', () => {
  it('persists and returns subject-scoped task projections', async () => {
    const store = new PublicMcpTaskProjectionStore(createMemoryDocumentStore());
    await store.create({
      taskId: 'task-1',
      toolName: 'ortho.agents.v1.invoke',
      subject: SUBJECT,
      canonicalRunId: 'run-1',
      status: 'queued',
      submittedAt: '2026-03-14T00:00:00.000Z',
    });
    await store.markRunning('task-1', '2026-03-14T00:00:01.000Z');

    const projection = await store.getTask(SUBJECT as any, 'task-1');

    expect(projection).toEqual(
      expect.objectContaining({
        taskId: 'task-1',
        canonicalRunId: 'run-1',
        status: 'running',
      }),
    );
  });

  it('hides task projections and results from other subjects', async () => {
    const store = new PublicMcpTaskProjectionStore(createMemoryDocumentStore());
    await store.create({
      taskId: 'task-1',
      toolName: 'ortho.agents.v1.invoke',
      subject: SUBJECT,
      canonicalRunId: 'run-1',
      status: 'queued',
      submittedAt: '2026-03-14T00:00:00.000Z',
    });
    await store.complete(
      'task-1',
      {
        taskId: 'task-1',
        status: 'completed',
        result: { ok: true },
      },
      '2026-03-14T00:00:02.000Z',
    );

    const projection = await store.getTask({
      clientId: 'client-2',
      namespace: SUBJECT.namespace,
    } as any, 'task-1');
    const result = await store.getTaskResult({
      clientId: 'client-2',
      namespace: SUBJECT.namespace,
    } as any, 'task-1');

    expect(projection).toBeNull();
    expect(result).toBeNull();
  });
});
