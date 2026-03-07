import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SqliteDocumentStore } from '@nous/autonomic-storage';
import { DocumentLtmStore } from '@nous/memory-ltm';
import { DistillationEngine } from '../distillation-engine.js';
import {
  NOW,
  PROJECT_ID,
  makeStablePromotionCluster,
} from './fixtures/production-scenarios.js';

function createTempDbPath(): string {
  return join(tmpdir(), `nous-distillation-${randomUUID()}.sqlite`);
}

describe('DocumentLtmStore compatibility', () => {
  it('promotes patterns and supersedes source records through the Phase 8.2 LTM seam', async () => {
    const documentStore = new SqliteDocumentStore(createTempDbPath());
    const ltm = new DocumentLtmStore(documentStore, {
      now: () => NOW,
    });
    const cluster = makeStablePromotionCluster();
    for (const record of cluster.records) {
      await ltm.write(record);
    }

    const engine = new DistillationEngine(ltm, {
      now: () => NOW,
      idFactory: (() => {
        let next = 1;
        return () => `992e8400-e29b-41d4-a716-${String(next++).padStart(12, '0')}`;
      })(),
    });

    const result = await engine.runDistillationPass(PROJECT_ID);

    expect(result.patternsCreated).toHaveLength(1);
    expect(result.recordsSuperseded).toHaveLength(cluster.records.length);

    const activeExperienceRecords = await ltm.query({
      type: 'experience-record',
      projectId: PROJECT_ID,
      lifecycleStatus: 'active',
    });
    expect(activeExperienceRecords).toHaveLength(0);

    const supersededExperienceRecords = await ltm.query({
      type: 'experience-record',
      projectId: PROJECT_ID,
      includeSuperseded: true,
    });
    expect(
      supersededExperienceRecords.every(
        (record) => record.lifecycleStatus === 'superseded',
      ),
    ).toBe(true);
  });
});
