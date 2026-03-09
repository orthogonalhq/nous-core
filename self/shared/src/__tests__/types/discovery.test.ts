/**
 * Phase 6.3 — Discovery schema contract tests.
 * Phase 6.4 — DiscoveryBenchmarkAcceptanceCriteriaSchema, PolicyLeakageRegressionFixtureSchema,
 * extended DiscoveryOrchestratorOutputSchema, Phase8DiscoveryExportSchema, Phase8EvidenceExportSchema.
 */
import { describe, it, expect } from 'vitest';
import {
  DiscoveryOrchestratorInputSchema,
  DiscoveryOrchestratorOutputSchema,
  DiscoveryBenchmarkFixtureSchema,
  DiscoveryBenchmarkAcceptanceCriteriaSchema,
  PolicyLeakageRegressionFixtureSchema,
} from '../../types/discovery.js';
import {
  ProjectDiscoveryRequestSchema,
  ProjectDiscoveryResultSchema,
} from '../../types/knowledge-index.js';
import {
  Phase8DiscoveryExportSchema,
  Phase8EvidenceExportSchema,
} from '../../types/phase8-export.js';
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

  it('accepts output with explainability, policyDenialRef, escalationSignal', () => {
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
      explainability: [
        {
          resultIndex: 0,
          projectId: P1,
          influencingSource: 'meta_vector',
          evidenceRefs: [{ actionCategory: 'mao-projection' as const }],
        },
      ],
      policyDenialRef: '550e8400-e29b-41d4-a716-446655440002',
    };
    expect(DiscoveryOrchestratorOutputSchema.safeParse(valid).success).toBe(
      true,
    );
  });
});

describe('DiscoveryBenchmarkAcceptanceCriteriaSchema', () => {
  it('accepts valid criteria with policyLeakageTolerance 0', () => {
    const valid = { policyLeakageTolerance: 0 as const };
    expect(
      DiscoveryBenchmarkAcceptanceCriteriaSchema.safeParse(valid).success,
    ).toBe(true);
  });
  it('rejects policyLeakageTolerance other than 0', () => {
    expect(
      DiscoveryBenchmarkAcceptanceCriteriaSchema.safeParse({
        policyLeakageTolerance: 1,
      }).success,
    ).toBe(false);
  });
});

describe('PolicyLeakageRegressionFixtureSchema', () => {
  it('accepts valid fixture', () => {
    const valid = {
      fixtureId: 'leakage-1',
      requestingProjectId: P1,
      targetProjectIds: [P1, P2],
      policyDenies: [P2],
      expectedAllowedProjectIds: [P1],
      runAt: new Date().toISOString(),
      actualProjectIdsReturned: [P1],
      passed: true,
    };
    expect(
      PolicyLeakageRegressionFixtureSchema.safeParse(valid).success,
    ).toBe(true);
  });
});

describe('Phase8DiscoveryExportSchema', () => {
  it('accepts valid export', () => {
    const valid = {
      version: '1.0' as const,
      exportedAt: new Date().toISOString(),
      requestingProjectId: P1,
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
    expect(Phase8DiscoveryExportSchema.safeParse(valid).success).toBe(true);
  });
});

describe('Phase8EvidenceExportSchema', () => {
  it('accepts valid export', () => {
    const valid = {
      version: '1.0' as const,
      exportedAt: new Date().toISOString(),
      evidenceRefs: [{ actionCategory: 'mao-projection' as const }],
    };
    expect(Phase8EvidenceExportSchema.safeParse(valid).success).toBe(true);
  });
});

describe('ProjectDiscoveryRequestSchema', () => {
  it('accepts a valid text-query discovery request', () => {
    const result = ProjectDiscoveryRequestSchema.safeParse({
      requestingProjectId: P1,
      query: 'budget forecasting',
      topK: 5,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.includeMetaVector).toBe(true);
      expect(result.data.includeTaxonomy).toBe(true);
      expect(result.data.includeRelationships).toBe(true);
    }
  });

  it('rejects topK outside supported range', () => {
    expect(
      ProjectDiscoveryRequestSchema.safeParse({
        requestingProjectId: P1,
        query: 'budget forecasting',
        topK: 0,
      }).success,
    ).toBe(false);
  });
});

describe('ProjectDiscoveryResultSchema', () => {
  it('accepts a policy-filtered discovery runtime result', () => {
    const result = ProjectDiscoveryResultSchema.safeParse({
      discovery: {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        requestingProjectId: P1,
        projectIds: [P1],
        results: [{ projectId: P1, rank: 1, combinedScore: 0.9 }],
        audit: {
          projectIdsDiscovered: [P1],
          metaVectorCount: 1,
          taxonomyCount: 1,
          relationshipCount: 0,
          mergeStrategy: 'meta-vector-primary',
        },
      },
      policy: {
        deniedProjectCount: 1,
        reasonCodes: ['POLICY-DENIED'],
        controlState: 'running',
      },
      snapshot: {
        projectId: P1,
        metaVector: null,
        taxonomy: [],
        relationships: {
          projectId: P1,
          outgoing: [],
          incoming: [],
        },
        latestRefresh: null,
        diagnostics: {
          runtimePosture: 'single_process_local',
          refreshInFlight: false,
          confidenceReasonCodes: [],
        },
      },
    });
    expect(result.success).toBe(true);
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
