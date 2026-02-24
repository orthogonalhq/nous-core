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

    // Export — assert soft-deleted entry remains for audit transparency
    const export2 = await pipeline.exportForProject(projectId as any);
    expect(export2.entries).toHaveLength(1);
    expect(export2.entries[0].lifecycleStatus).toBe('soft-deleted');

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
    expect(export3.entries.some((entry) => entry.lifecycleStatus === 'active')).toBe(
      false,
    );
    expect(export3.stm.entries).toHaveLength(0);
  });

  it('deterministic mutation ordering for identical mutation sequence', async () => {
    const build = async () => {
      const deterministicIds = [
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000004',
        '00000000-0000-0000-0000-000000000005',
        '00000000-0000-0000-0000-000000000006',
      ];
      let i = 0;
      const fixedNow = '2026-02-22T00:00:00.000Z';
      const dbPath = join(tmpdir(), `nous-mwc-order-${randomUUID()}.sqlite`);
      const projectId = randomUUID();
      const doc = new SqliteDocumentStore(dbPath);
      const stm = new DocumentStmStore(doc);
      const pip = new MwcPipeline(
        doc,
        stm,
        createStubEvaluator(),
        undefined,
        {
          idFactory: () => deterministicIds[i++ % deterministicIds.length],
          now: () => fixedNow,
        },
      );

      const candidate = {
        content: 'Deterministic',
        type: 'fact' as const,
        scope: 'project' as const,
        projectId: projectId as any,
        confidence: 0.9,
        sensitivity: [],
        retention: 'permanent' as const,
        provenance: {
          traceId: randomUUID() as any,
          source: 'test',
          timestamp: fixedNow,
        },
        tags: [],
      };

      const firstId = await pip.submit(candidate, projectId as any);
      await pip.mutate({
        action: 'soft-delete',
        actor: 'operator',
        targetEntryId: firstId!,
        projectId: projectId as any,
        reason: 'delete',
        traceId: candidate.provenance.traceId,
        evidenceRefs: [],
      });
      return pip.listMutationAudit(projectId as any);
    };

    const runA = await build();
    const runB = await build();
    const shapeA = runA.map((item) => ({
      sequence: item.sequence,
      action: item.action,
      outcome: item.outcome,
      reasonCode: item.reasonCode,
    }));
    const shapeB = runB.map((item) => ({
      sequence: item.sequence,
      action: item.action,
      outcome: item.outcome,
      reasonCode: item.reasonCode,
    }));
    expect(shapeA).toEqual(shapeB);
  });
});
