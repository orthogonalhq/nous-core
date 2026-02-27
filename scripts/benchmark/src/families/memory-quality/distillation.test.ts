/**
 * MemoryQualityBench distillation subset — AA-004 traceability.
 *
 * Phase 4.3: Clustering consistency, confidence formula determinism,
 * provenance completeness. Benchmark acceptance criteria defined and passing.
 */
import { describe, it, expect } from 'vitest';
import { DistillationEngine } from '@nous/memory-distillation';
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

describe('MemoryQualityBench — distillation (AA-004)', () => {
  describe('clustering consistency', () => {
    it('same input yields same cluster keys', async () => {
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
      const clusters1 = await engine.identifyClusters(PROJ);
      const clusters2 = await engine.identifyClusters(PROJ);

      expect(clusters1.length).toBe(clusters2.length);
      expect(clusters1.map((c) => c.clusterKey)).toEqual(clusters2.map((c) => c.clusterKey));
    });
  });

  describe('confidence formula determinism', () => {
    it('equivalent input yields same confidence', async () => {
      const ltm = new InMemoryLtmStore();
      const recs = [
        makeRecord('550e8400-e29b-41d4-a716-446655440010'),
        makeRecord('550e8400-e29b-41d4-a716-446655440011'),
        makeRecord('550e8400-e29b-41d4-a716-446655440012'),
      ];
      for (const r of recs) await ltm.write(r);

      const engine = new DistillationEngine(ltm);
      const clusters = await engine.identifyClusters(PROJ);
      const pattern1 = await engine.distill(clusters[0]!);
      const pattern2 = await engine.distill(clusters[0]!);

      expect(pattern1.confidence).toBe(pattern2.confidence);
    });
  });

  describe('provenance completeness', () => {
    it('distilled pattern has provenance and evidenceRefs', async () => {
      const ltm = new InMemoryLtmStore();
      const recs = [
        makeRecord('550e8400-e29b-41d4-a716-446655440010'),
        makeRecord('550e8400-e29b-41d4-a716-446655440011'),
        makeRecord('550e8400-e29b-41d4-a716-446655440012'),
      ];
      for (const r of recs) await ltm.write(r);

      const engine = new DistillationEngine(ltm);
      const clusters = await engine.identifyClusters(PROJ);
      const pattern = await engine.distill(clusters[0]!);

      expect(pattern.provenance).toBeDefined();
      expect(pattern.provenance.source).toBe('distillation');
      expect(pattern.provenance.traceId).toBeDefined();
      expect(pattern.evidenceRefs.length).toBeGreaterThan(0);
      expect(pattern.basedOn.length).toBe(3);
      expect(pattern.supersedes.length).toBe(3);
    });
  });
});
