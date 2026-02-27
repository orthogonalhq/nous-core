/**
 * DistillationEngine behavior tests.
 * Phase 4.3: identifyClusters, distill, runDistillationPass produce valid patterns with provenance.
 */
import { describe, it, expect } from 'vitest';
import { DistillationEngine } from '../distillation-engine.js';
import { InMemoryLtmStore } from '@nous/memory-stubs';
import type { ExperienceRecord } from '@nous/shared';
import { ExperienceRecordSchema } from '@nous/shared';

const NOW = new Date().toISOString();
const PROJ = '550e8400-e29b-41d4-a716-446655440000';
const TRACE = '550e8400-e29b-41d4-a716-446655440001';

function makeRecord(id: string): ExperienceRecord {
  return ExperienceRecordSchema.parse({
    id,
    content: 'ctx',
    type: 'experience-record',
    scope: 'project',
    projectId: PROJ,
    confidence: 0.8,
    sensitivity: [],
    retention: 'permanent',
    provenance: { traceId: TRACE, source: 'test', timestamp: NOW },
    tags: ['tag1'],
    sentiment: 'strong-positive',
    context: 'ctx',
    action: 'act',
    outcome: 'out',
    reason: 'reason',
    createdAt: NOW,
    updatedAt: NOW,
  });
}

describe('DistillationEngine', () => {
  it('identifyClusters returns clusters', async () => {
    const ltm = new InMemoryLtmStore();
    await ltm.write(makeRecord('550e8400-e29b-41d4-a716-446655440010'));
    await ltm.write(makeRecord('550e8400-e29b-41d4-a716-446655440011'));
    await ltm.write(makeRecord('550e8400-e29b-41d4-a716-446655440012'));

    const engine = new DistillationEngine(ltm, {
      clusterConfig: { minClusterSize: 2, maxClusterSize: 10, clusteringStrategy: 'project' },
    });
    const clusters = await engine.identifyClusters(PROJ);
    expect(clusters.length).toBeGreaterThan(0);
    expect(clusters[0]!.records.length).toBe(3);
  });

  it('distill produces pattern with provenance', async () => {
    const ltm = new InMemoryLtmStore();
    const recs = [
      makeRecord('550e8400-e29b-41d4-a716-446655440010'),
      makeRecord('550e8400-e29b-41d4-a716-446655440011'),
      makeRecord('550e8400-e29b-41d4-a716-446655440012'),
    ];
    for (const r of recs) await ltm.write(r);

    const engine = new DistillationEngine(ltm);
    const clusters = await engine.identifyClusters(PROJ);
    expect(clusters.length).toBeGreaterThan(0);

    const pattern = await engine.distill(clusters[0]!);
    expect(pattern.type).toBe('distilled-pattern');
    expect(pattern.basedOn.length).toBe(3);
    expect(pattern.supersedes.length).toBe(3);
    expect(pattern.evidenceRefs.length).toBeGreaterThan(0);
    expect(pattern.confidence).toBeGreaterThanOrEqual(0);
  });

  it('runDistillationPass creates patterns and marks superseded', async () => {
    const ltm = new InMemoryLtmStore();
    const recs = [
      makeRecord('550e8400-e29b-41d4-a716-446655440010'),
      makeRecord('550e8400-e29b-41d4-a716-446655440011'),
      makeRecord('550e8400-e29b-41d4-a716-446655440012'),
    ];
    for (const r of recs) await ltm.write(r);

    const engine = new DistillationEngine(ltm, {
      clusterConfig: { minClusterSize: 2, maxClusterSize: 10, clusteringStrategy: 'project' },
    });
    const result = await engine.runDistillationPass(PROJ);

    expect(result.clustersProcessed).toBeGreaterThan(0);
    expect(result.patternsCreated.length).toBeGreaterThan(0);
    expect(result.recordsSuperseded.length).toBe(3);

    const superseded = await ltm.read('550e8400-e29b-41d4-a716-446655440010');
    expect(superseded?.lifecycleStatus).toBe('superseded');
    expect(superseded?.supersededBy).toBeDefined();
  });
});
