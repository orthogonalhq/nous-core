/**
 * Phase 6.3 — Discovery schema contract tests.
 */
import { describe, it, expect } from 'vitest';
import {
  DiscoveryOrchestratorInputSchema,
  DiscoveryOrchestratorOutputSchema,
  DiscoveryBenchmarkFixtureSchema,
} from '../../types/discovery.js';
import { ProjectIdSchema } from '../../types/ids.js';

const P1 = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440000');
const P2 = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440001');

describe('DiscoveryOrchestratorInputSchema', () => {
  it('accepts valid input with defaults', () => {
    const valid = {
      queryVector: [0.1, 0.2, 0.3],
      topK: 5,
      requestingProjectId: P1,
    };
    const parsed = DiscoveryOrchestratorInputSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.includeMetaVector).toBe(true);
      expect(parsed.data.includeTaxonomy).toBe(true);
      expect(parsed.data.includeRelationships).toBe(true);
    }
  });
  it('rejects topK < 1', () => {
    expect(
      DiscoveryOrchestratorInputSchema.safeParse({
        queryVector: [],
        topK: 0,
        requestingProjectId: P1,
      }).success,
    ).toBe(false);
  });
});

describe('DiscoveryOrchestratorOutputSchema', () => {
  it('accepts valid output', () => {
    const valid = {
      projectIds: [P1, P2],
      results: [
        { projectId: P1, rank: 1, combinedScore: 0.9 },
        { projectId: P2, rank: 2, combinedScore: 0.7 },
      ],
      audit: {
        projectIdsDiscovered: [P1, P2],
        metaVectorCount: 2,
        taxonomyCount: 0,
        relationshipCount: 0,
        mergeStrategy: 'meta-vector-primary',
      },
    };
    expect(DiscoveryOrchestratorOutputSchema.safeParse(valid).success).toBe(
      true,
    );
  });
});

describe('DiscoveryBenchmarkFixtureSchema', () => {
  it('accepts valid fixture', () => {
    const valid = {
      fixtureId: 'fixture-1',
      queryEmbeddingRef: 'ref-1',
      expectedProjectRanking: [P1, P2],
      runAt: new Date().toISOString(),
      actualRanking: [P1, P2],
      passed: true,
    };
    expect(DiscoveryBenchmarkFixtureSchema.safeParse(valid).success).toBe(true);
  });
});
