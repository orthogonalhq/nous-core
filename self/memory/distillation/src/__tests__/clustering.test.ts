/**
 * Clustering determinism tests.
 * Phase 4.3: Same input → same output; tie-break by entry.id.
 */
import { describe, it, expect } from 'vitest';
import { identifyClusters } from '../clustering.js';
import type { ExperienceRecord } from '@nous/shared';
import { ExperienceRecordSchema } from '@nous/shared';
import {
  DEFAULT_DISTILLATION_CLUSTER_CONFIG,
  type DistillationClusterConfig,
} from '@nous/shared';

const NOW = new Date().toISOString();
const PROJ = '550e8400-e29b-41d4-a716-446655440000';
const TRACE = '550e8400-e29b-41d4-a716-446655440001';

function makeRecord(
  id: string,
  projectId: string,
  tags: string[],
): ExperienceRecord {
  return ExperienceRecordSchema.parse({
    id,
    content: 'ctx',
    type: 'experience-record',
    scope: 'project',
    projectId,
    confidence: 0.8,
    sensitivity: [],
    retention: 'permanent',
    provenance: { traceId: TRACE, source: 'test', timestamp: NOW },
    tags,
    sentiment: 'strong-positive',
    context: 'ctx',
    action: 'act',
    outcome: 'out',
    reason: 'reason',
    createdAt: NOW,
    updatedAt: NOW,
  });
}

describe('identifyClusters', () => {
  describe('determinism', () => {
    it('same input produces same cluster IDs', () => {
      const records: ExperienceRecord[] = [
        makeRecord('550e8400-e29b-41d4-a716-446655440010', PROJ, ['x', 'y']),
        makeRecord('550e8400-e29b-41d4-a716-446655440011', PROJ, ['x', 'y']),
        makeRecord('550e8400-e29b-41d4-a716-446655440012', PROJ, ['x']),
      ];
      const c1 = identifyClusters(records);
      const c2 = identifyClusters(records);
      expect(c1.length).toBe(c2.length);
      for (let i = 0; i < c1.length; i++) {
        expect(c1[i]!.clusterKey).toBe(c2[i]!.clusterKey);
        expect(c1[i]!.records.map((r) => r.id).sort()).toEqual(
          c2[i]!.records.map((r) => r.id).sort(),
        );
      }
    });

    it('tie-break by entry.id lexicographic', () => {
      const records: ExperienceRecord[] = [
        makeRecord('550e8400-e29b-41d4-a716-446655440020', PROJ, ['t']),
        makeRecord('550e8400-e29b-41d4-a716-446655440021', PROJ, ['t']),
        makeRecord('550e8400-e29b-41d4-a716-446655440022', PROJ, ['t']),
      ];
      const clusters = identifyClusters(records);
      expect(clusters.length).toBeGreaterThan(0);
      const ids = clusters[0]!.records.map((r) => r.id).sort();
      expect(ids).toEqual([
        '550e8400-e29b-41d4-a716-446655440020',
        '550e8400-e29b-41d4-a716-446655440021',
        '550e8400-e29b-41d4-a716-446655440022',
      ]);
    });
  });

  describe('project strategy', () => {
    it('groups by projectId', () => {
      const proj2 = '550e8400-e29b-41d4-a716-446655440001';
      const records: ExperienceRecord[] = [
        makeRecord('550e8400-e29b-41d4-a716-446655440030', PROJ, []),
        makeRecord('550e8400-e29b-41d4-a716-446655440031', PROJ, []),
        makeRecord('550e8400-e29b-41d4-a716-446655440032', PROJ, []),
        makeRecord('550e8400-e29b-41d4-a716-446655440033', proj2, []),
        makeRecord('550e8400-e29b-41d4-a716-446655440034', proj2, []),
      ];
      const config: DistillationClusterConfig = {
        ...DEFAULT_DISTILLATION_CLUSTER_CONFIG,
        clusteringStrategy: 'project',
        minClusterSize: 2,
      };
      const clusters = identifyClusters(records, config);
      expect(clusters.length).toBe(2);
      const proj1Cluster = clusters.find((c) => c.records.some((r) => r.projectId === PROJ));
      const proj2Cluster = clusters.find((c) => c.records.some((r) => r.projectId === proj2));
      expect(proj1Cluster!.records.length).toBe(3);
      expect(proj2Cluster!.records.length).toBe(2);
    });
  });

  describe('tag strategy', () => {
    it('groups by tag overlap', () => {
      const records: ExperienceRecord[] = [
        makeRecord('550e8400-e29b-41d4-a716-446655440040', PROJ, ['x', 'y']),
        makeRecord('550e8400-e29b-41d4-a716-446655440041', PROJ, ['x', 'y']),
        makeRecord('550e8400-e29b-41d4-a716-446655440042', PROJ, ['x']),
      ];
      const config: DistillationClusterConfig = {
        ...DEFAULT_DISTILLATION_CLUSTER_CONFIG,
        clusteringStrategy: 'tag',
        tagOverlapMin: 1,
        minClusterSize: 2,
      };
      const clusters = identifyClusters(records, config);
      expect(clusters.length).toBeGreaterThan(0);
    });
  });
});
