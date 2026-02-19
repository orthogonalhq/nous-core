/**
 * Unit tests for MwcPipeline.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { MwcPipeline, createStubEvaluator } from '../index.js';
import { DocumentStmStore } from '@nous/memory-stm';
import { SqliteDocumentStore } from '@nous/autonomic-storage';
import { ValidationError } from '@nous/shared';

function createTempDbPath(): string {
  return join(tmpdir(), `nous-mwc-test-${randomUUID()}.sqlite`);
}

function createValidCandidate(projectId?: string) {
  return {
    content: 'User prefers dark mode',
    type: 'preference' as const,
    scope: 'project' as const,
    projectId: projectId as any,
    confidence: 0.85,
    sensitivity: [],
    retention: 'permanent' as const,
    provenance: {
      traceId: randomUUID() as any,
      source: 'model',
      timestamp: new Date().toISOString(),
    },
    tags: ['ui', 'preference'],
  };
}

describe('MwcPipeline', () => {
  let documentStore: SqliteDocumentStore;
  let stmStore: DocumentStmStore;
  let pipeline: MwcPipeline;
  let projectId: string;

  beforeEach(() => {
    const dbPath = createTempDbPath();
    documentStore = new SqliteDocumentStore(dbPath);
    stmStore = new DocumentStmStore(documentStore);
    pipeline = new MwcPipeline(documentStore, stmStore, createStubEvaluator());
    projectId = randomUUID();
  });

  it('submit with stub evaluator returns MemoryEntryId', async () => {
    const candidate = createValidCandidate(projectId);
    const id = await pipeline.submit(candidate, projectId as any);
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('submit with denying evaluator returns null', async () => {
    const denyingPipeline = new MwcPipeline(
      documentStore,
      stmStore,
      async () => ({ approved: false, reason: 'test deny' }),
    );
    const candidate = createValidCandidate(projectId);
    const id = await denyingPipeline.submit(candidate, projectId as any);
    expect(id).toBeNull();
  });

  it('submit valid candidate persists entry', async () => {
    const candidate = createValidCandidate(projectId);
    const id = await pipeline.submit(candidate, projectId as any);
    expect(id).toBeTruthy();

    const { entries } = await pipeline.exportForProject(projectId as any);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(id);
    expect(entries[0].content).toBe(candidate.content);
    expect(entries[0].type).toBe(candidate.type);
    expect(entries[0].projectId).toBe(projectId);
    expect(entries[0].provenance).toEqual(candidate.provenance);
  });

  it('exportForProject returns stm and entries', async () => {
    await stmStore.append(projectId as any, {
      role: 'user',
      content: 'Hello',
      timestamp: new Date().toISOString(),
    });
    const candidate = createValidCandidate(projectId);
    await pipeline.submit(candidate, projectId as any);

    const result = await pipeline.exportForProject(projectId as any);
    expect(result.stm.entries).toHaveLength(1);
    expect(result.entries).toHaveLength(1);
  });

  it('deleteEntry removes entry', async () => {
    const candidate = createValidCandidate(projectId);
    const id = await pipeline.submit(candidate, projectId as any);
    expect(id).toBeTruthy();

    const deleted = await pipeline.deleteEntry(id!);
    expect(deleted).toBe(true);

    const { entries } = await pipeline.exportForProject(projectId as any);
    expect(entries).toHaveLength(0);
  });

  it('deleteAllForProject clears memory_entries and STM', async () => {
    await stmStore.append(projectId as any, {
      role: 'user',
      content: 'Test',
      timestamp: new Date().toISOString(),
    });
    await pipeline.submit(createValidCandidate(projectId), projectId as any);
    await pipeline.submit(createValidCandidate(projectId), projectId as any);

    const count = await pipeline.deleteAllForProject(projectId as any);
    expect(count).toBe(2);

    const result = await pipeline.exportForProject(projectId as any);
    expect(result.entries).toHaveLength(0);
    expect(result.stm.entries).toHaveLength(0);
  });

  it('invalid candidate throws ValidationError before evaluator', async () => {
    const invalidCandidate = {
      content: 'Test',
      type: 'invalid-type' as any,
      scope: 'project',
      confidence: 0.5,
      sensitivity: [],
      retention: 'permanent',
      provenance: {
        traceId: randomUUID() as any,
        source: 'test',
        timestamp: new Date().toISOString(),
      },
      tags: [],
    };

    await expect(
      pipeline.submit(invalidCandidate as any, projectId as any),
    ).rejects.toThrow(ValidationError);

    const { entries } = await pipeline.exportForProject(projectId as any);
    expect(entries).toHaveLength(0);
  });

  it('denied candidate does not persist', async () => {
    const denyingPipeline = new MwcPipeline(
      documentStore,
      stmStore,
      async () => ({ approved: false }),
    );
    const candidate = createValidCandidate(projectId);
    await denyingPipeline.submit(candidate, projectId as any);

    const { entries } = await pipeline.exportForProject(projectId as any);
    expect(entries).toHaveLength(0);
  });

  it('exportForProject for project with no entries returns empty', async () => {
    const result = await pipeline.exportForProject(projectId as any);
    expect(result.stm.entries).toHaveLength(0);
    expect(result.entries).toHaveLength(0);
  });

  it('deleteEntry for non-existent id returns false', async () => {
    const result = await pipeline.deleteEntry(
      '00000000-0000-0000-0000-000000000001' as any,
    );
    expect(result).toBe(false);
  });
});
