/**
 * Distillation schema contract tests.
 * Phase 4.3: DistillationClusterConfig, ConfidenceLifecycle, ConfidenceRefreshInput,
 * ConfidenceDecayInput, SupersessionReversalRequest.
 */
import { describe, it, expect } from 'vitest';
import {
  DistillationClusterConfigSchema,
  ConfidenceLifecycleSchema,
  ConfidenceRefreshInputSchema,
  ConfidenceDecayInputSchema,
  SupersessionReversalRequestSchema,
  DEFAULT_DISTILLATION_CLUSTER_CONFIG,
  DEFAULT_CONFIDENCE_LIFECYCLE,
} from '../../types/distillation.js';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_UUID_2 = '550e8400-e29b-41d4-a716-446655440001';

describe('DistillationClusterConfigSchema', () => {
  it('accepts valid config', () => {
    expect(
      DistillationClusterConfigSchema.safeParse(DEFAULT_DISTILLATION_CLUSTER_CONFIG)
        .success,
    ).toBe(true);
  });

  it('accepts strategy tag with tagOverlapMin', () => {
    const result = DistillationClusterConfigSchema.safeParse({
      ...DEFAULT_DISTILLATION_CLUSTER_CONFIG,
      clusteringStrategy: 'tag',
      tagOverlapMin: 2,
    });
    expect(result.success).toBe(true);
  });

  it('accepts strategy semantic with threshold', () => {
    const result = DistillationClusterConfigSchema.safeParse({
      ...DEFAULT_DISTILLATION_CLUSTER_CONFIG,
      clusteringStrategy: 'semantic',
      semanticSimilarityThreshold: 0.8,
    });
    expect(result.success).toBe(true);
  });

  it('rejects minClusterSize < 2', () => {
    expect(
      DistillationClusterConfigSchema.safeParse({
        ...DEFAULT_DISTILLATION_CLUSTER_CONFIG,
        minClusterSize: 1,
      }).success,
    ).toBe(false);
  });

  it('rejects invalid clusteringStrategy', () => {
    expect(
      DistillationClusterConfigSchema.safeParse({
        ...DEFAULT_DISTILLATION_CLUSTER_CONFIG,
        clusteringStrategy: 'invalid',
      }).success,
    ).toBe(false);
  });
});

describe('ConfidenceLifecycleSchema', () => {
  it('accepts valid config', () => {
    expect(
      ConfidenceLifecycleSchema.safeParse(DEFAULT_CONFIDENCE_LIFECYCLE).success,
    ).toBe(true);
  });

  it('rejects refreshIncrement > 0.1', () => {
    expect(
      ConfidenceLifecycleSchema.safeParse({
        ...DEFAULT_CONFIDENCE_LIFECYCLE,
        refreshIncrement: 0.15,
      }).success,
    ).toBe(false);
  });

  it('rejects contradictionRetirementThreshold > 0.5', () => {
    expect(
      ConfidenceLifecycleSchema.safeParse({
        ...DEFAULT_CONFIDENCE_LIFECYCLE,
        contradictionRetirementThreshold: 0.6,
      }).success,
    ).toBe(false);
  });
});

describe('ConfidenceRefreshInputSchema', () => {
  const valid = {
    patternId: VALID_UUID,
    confirmingRecordId: VALID_UUID_2,
    alignmentScore: 0.95,
  };

  it('accepts valid input', () => {
    expect(ConfidenceRefreshInputSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects alignmentScore > 1', () => {
    expect(
      ConfidenceRefreshInputSchema.safeParse({
        ...valid,
        alignmentScore: 1.1,
      }).success,
    ).toBe(false);
  });

  it('rejects missing patternId', () => {
    const { patternId: _, ...rest } = valid;
    expect(ConfidenceRefreshInputSchema.safeParse(rest).success).toBe(false);
  });
});

describe('ConfidenceDecayInputSchema', () => {
  it('accepts staleness reason', () => {
    const result = ConfidenceDecayInputSchema.safeParse({
      patternId: VALID_UUID,
      reason: 'staleness',
      stalenessDays: 30,
    });
    expect(result.success).toBe(true);
  });

  it('accepts contradiction reason with contradictingRecordId', () => {
    const result = ConfidenceDecayInputSchema.safeParse({
      patternId: VALID_UUID,
      reason: 'contradiction',
      contradictingRecordId: VALID_UUID_2,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid reason', () => {
    expect(
      ConfidenceDecayInputSchema.safeParse({
        patternId: VALID_UUID,
        reason: 'invalid',
      }).success,
    ).toBe(false);
  });
});

describe('SupersessionReversalRequestSchema', () => {
  const valid = {
    patternId: VALID_UUID,
    reason: 'User requested rollback',
    evidenceRefs: [{ actionCategory: 'memory-write' as const }],
  };

  it('accepts valid request', () => {
    expect(SupersessionReversalRequestSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects empty reason', () => {
    expect(
      SupersessionReversalRequestSchema.safeParse({
        ...valid,
        reason: '',
      }).success,
    ).toBe(false);
  });

  it('rejects empty evidenceRefs', () => {
    expect(
      SupersessionReversalRequestSchema.safeParse({
        ...valid,
        evidenceRefs: [],
      }).success,
    ).toBe(false);
  });
});
