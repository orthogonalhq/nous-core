/**
 * Integration test: MWC pipeline end-to-end.
 *
 * Proves: submit → persist → export → delete wiring.
 */
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { MwcPipeline, createStubEvaluator } from '../index.js';
import { DocumentStmStore } from '@nous/memory-stm';
import { SqliteDocumentStore } from '@nous/autonomic-storage';

describe('MWC pipeline integration', () => {
  it('submit → export → deleteEntry → deleteAllForProject flow', async () => {
    const dbPath = join(tmpdir(), `nous-mwc-integration-${randomUUID()}.sqlite`);
    const projectId = randomUUID();

    const documentStore = new SqliteDocumentStore(dbPath);
    const stmStore = new DocumentStmStore(documentStore);
    const pipeline = new MwcPipeline(
      documentStore,
      stmStore,
      createStubEvaluator(),
    );

    // Submit valid candidate
    const candidate = {
      content: 'User prefers concise responses',
      type: 'preference' as const,
      scope: 'project' as const,
      projectId: projectId as any,
      confidence: 0.9,
      sensitivity: [],
      retention: 'permanent' as const,
      provenance: {
        traceId: randomUUID() as any,
        source: 'model',
        timestamp: new Date().toISOString(),
      },
      tags: ['style'],
    };

    const id = await pipeline.submit(candidate, projectId as any);
    expect(id).toBeTruthy();

    // Export — assert entry present
    const export1 = await pipeline.exportForProject(projectId as any);
    expect(export1.entries).toHaveLength(1);
    expect(export1.entries[0].content).toBe(candidate.content);

    // Delete single entry
    const deleted = await pipeline.deleteEntry(id!);
    expect(deleted).toBe(true);

    // Export — assert empty
    const export2 = await pipeline.exportForProject(projectId as any);
    expect(export2.entries).toHaveLength(0);

    // Submit another, add STM
    await stmStore.append(projectId as any, {
      role: 'user',
      content: 'Remember this',
      timestamp: new Date().toISOString(),
    });
    await pipeline.submit(
      { ...candidate, content: 'Second entry' },
      projectId as any,
    );

    // DeleteAllForProject — clears both
    const count = await pipeline.deleteAllForProject(projectId as any);
    expect(count).toBe(1);

    const export3 = await pipeline.exportForProject(projectId as any);
    expect(export3.entries).toHaveLength(0);
    expect(export3.stm.entries).toHaveLength(0);
  });
});
