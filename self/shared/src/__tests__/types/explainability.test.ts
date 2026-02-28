/**
 * Phase 6.4 — CrossProjectRecommendationExplainabilitySchema contract tests.
 */
import { describe, it, expect } from 'vitest';
import {
  CrossProjectRecommendationExplainabilitySchema,
} from '../../types/explainability.js';
import { ProjectIdSchema } from '../../types/ids.js';

const P1 = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440000');

describe('CrossProjectRecommendationExplainabilitySchema', () => {
  it('accepts valid explainability with minimal evidenceRefs', () => {
    const valid = {
      resultIndex: 0,
      projectId: P1,
      influencingSource: 'meta_vector',
      evidenceRefs: [{ actionCategory: 'mao-projection' as const }],
    };
    expect(
      CrossProjectRecommendationExplainabilitySchema.safeParse(valid).success,
    ).toBe(true);
  });

  it('accepts explainability with all optional fields', () => {
    const valid = {
      resultIndex: 1,
      projectId: P1,
      influencingSource: 'combined',
      metaVectorScore: 0.9,
      taxonomyTags: ['finance', 'real-estate'],
      evidenceRefs: [{ actionCategory: 'mao-projection' as const }],
      policyDecisionRef: '550e8400-e29b-41d4-a716-446655440001',
      controlStateRef: 'active',
    };
    expect(
      CrossProjectRecommendationExplainabilitySchema.safeParse(valid).success,
    ).toBe(true);
  });

  it('rejects empty evidenceRefs', () => {
    const invalid = {
      resultIndex: 0,
      projectId: P1,
      influencingSource: 'meta_vector',
      evidenceRefs: [],
    };
    expect(
      CrossProjectRecommendationExplainabilitySchema.safeParse(invalid).success,
    ).toBe(false);
  });

  it('rejects invalid influencingSource', () => {
    const invalid = {
      resultIndex: 0,
      projectId: P1,
      influencingSource: 'invalid',
      evidenceRefs: [{ actionCategory: 'mao-projection' as const }],
    };
    expect(
      CrossProjectRecommendationExplainabilitySchema.safeParse(invalid).success,
    ).toBe(false);
  });
});
