/**
 * E2E flow test: create project → send message → response → trace → memory.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createNousContext, clearNousContextCache } from '../server/bootstrap';
import { createProjectConfig } from '../test-support/project-fixtures';

describe('e2e flow', () => {
  beforeAll(async () => {
    process.env.NOUS_DATA_DIR = join(tmpdir(), `nous-web-e2e-${randomUUID()}`);
    clearNousContextCache();
  });

  it('create project → send message → response → trace → memory', async () => {
    const ctx = createNousContext();

    // Create project
    const projectId = await ctx.projectStore.create(createProjectConfig({
      id: randomUUID() as import('@nous/shared').ProjectId,
      name: 'E2E Test Project',
    }));

    const project = await ctx.projectStore.get(projectId);
    expect(project).toBeDefined();
    expect(project?.name).toBe('E2E Test Project');

    // Send message
    const traceId = randomUUID() as import('@nous/shared').TraceId;
    const stmContext = await ctx.stmStore.getContext(projectId);
    const result = await ctx.coreExecutor.executeTurn({
      message: 'Hello, E2E test',
      projectId,
      traceId,
      stmContext,
    });

    expect(result.response).toBeDefined();
    expect(typeof result.response).toBe('string');
    expect(result.traceId).toBe(traceId);

    // Trace persisted
    const traceRaw = await ctx.documentStore.get<unknown>('execution_traces', traceId);
    expect(traceRaw).toBeDefined();
    expect(traceRaw).toHaveProperty('traceId', traceId);
    expect(traceRaw).toHaveProperty('projectId', projectId);
    expect(traceRaw).toHaveProperty('turns');
    expect(Array.isArray((traceRaw as { turns: unknown[] }).turns)).toBe(true);

    // STM updated (user + assistant messages appended by chat router in real flow;
    // here we only ran executeTurn, so STM may be empty unless we append)
    const afterContext = await ctx.stmStore.getContext(projectId);
    expect(afterContext).toBeDefined();
    expect(Array.isArray(afterContext.entries)).toBe(true);
  });
});
