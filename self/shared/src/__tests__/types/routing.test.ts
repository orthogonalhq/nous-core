import { describe, it, expect } from 'vitest';
import {
  ModelRequirementsSchema,
  RouteContextSchema,
  RouteDecisionEvidenceSchema,
  RouteResultSchema,
  FailoverReasonCodeSchema,
  STANDARD_CAPABILITY_PROFILES,
} from '../../types/routing.js';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const TRACE_UUID = '660e8400-e29b-41d4-a716-446655440001';

describe('ModelRequirementsSchema', () => {
  it('accepts valid model requirements', () => {
    const result = ModelRequirementsSchema.safeParse({
      profile: 'review-standard',
      fallbackPolicy: 'block_if_unmet',
    });
    expect(result.success).toBe(true);
  });

  it('accepts principal-override policy', () => {
    const result = ModelRequirementsSchema.safeParse({
      profile: 'review-implementation',
      fallbackPolicy: 'principal-override',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid fallback policy', () => {
    const result = ModelRequirementsSchema.safeParse({
      profile: 'review-standard',
      fallbackPolicy: 'allow_all',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing profile', () => {
    const result = ModelRequirementsSchema.safeParse({
      fallbackPolicy: 'block_if_unmet',
    });
    expect(result.success).toBe(false);
  });
});

describe('RouteContextSchema', () => {
  it('accepts valid route context', () => {
    const result = RouteContextSchema.safeParse({
      traceId: TRACE_UUID,
      modelRequirements: {
        profile: 'review-standard',
        fallbackPolicy: 'block_if_unmet',
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts context with projectId and principalOverrideEvidence', () => {
    const result = RouteContextSchema.safeParse({
      projectId: VALID_UUID,
      traceId: TRACE_UUID,
      modelRequirements: {
        profile: 'review-standard',
        fallbackPolicy: 'block_if_unmet',
      },
      principalOverrideEvidence: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid traceId', () => {
    const result = RouteContextSchema.safeParse({
      traceId: 'not-a-uuid',
      modelRequirements: {
        profile: 'review-standard',
        fallbackPolicy: 'block_if_unmet',
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('RouteDecisionEvidenceSchema', () => {
  it('accepts valid evidence', () => {
    const result = RouteDecisionEvidenceSchema.safeParse({
      profileId: 'hybrid_controlled',
      policyLink: 'block_if_unmet',
      capabilityProfile: 'review-standard',
      selectedProviderId: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  it('accepts evidence with failover hop and reason code', () => {
    const result = RouteDecisionEvidenceSchema.safeParse({
      profileId: 'hybrid_controlled',
      policyLink: 'block_if_unmet',
      capabilityProfile: 'review-standard',
      selectedProviderId: VALID_UUID,
      failoverHop: 1,
      failoverReasonCode: 'PRV-PROVIDER-UNAVAILABLE',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid providerId', () => {
    const result = RouteDecisionEvidenceSchema.safeParse({
      profileId: 'hybrid_controlled',
      policyLink: 'block_if_unmet',
      capabilityProfile: 'review-standard',
      selectedProviderId: 'invalid',
    });
    expect(result.success).toBe(false);
  });
});

describe('RouteResultSchema', () => {
  it('accepts valid route result', () => {
    const result = RouteResultSchema.safeParse({
      providerId: VALID_UUID,
      evidence: {
        profileId: 'hybrid_controlled',
        policyLink: 'block_if_unmet',
        capabilityProfile: 'review-standard',
        selectedProviderId: VALID_UUID,
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing evidence', () => {
    const result = RouteResultSchema.safeParse({
      providerId: VALID_UUID,
    });
    expect(result.success).toBe(false);
  });
});

describe('FailoverReasonCodeSchema', () => {
  it('accepts all PRV-* codes', () => {
    const codes = [
      'PRV-PROFILE-BOUNDARY',
      'PRV-THRESHOLD-MISS',
      'PRV-AUTH-FAILURE',
      'PRV-PROVIDER-UNAVAILABLE',
      'PRV-RATE-LIMIT',
      'PRV-HOP-LIMIT',
      'PRV-PRINCIPAL-OVERRIDE',
    ];
    for (const code of codes) {
      expect(FailoverReasonCodeSchema.safeParse(code).success).toBe(true);
    }
  });

  it('rejects invalid code', () => {
    expect(FailoverReasonCodeSchema.safeParse('PRV-UNKNOWN').success).toBe(
      false,
    );
    expect(FailoverReasonCodeSchema.safeParse('AUTH-MISSING').success).toBe(
      false,
    );
  });
});

describe('STANDARD_CAPABILITY_PROFILES', () => {
  it('includes expected profiles', () => {
    expect(STANDARD_CAPABILITY_PROFILES).toContain('review-standard');
    expect(STANDARD_CAPABILITY_PROFILES).toContain('review-implementation');
    expect(STANDARD_CAPABILITY_PROFILES).toContain('prompt-generation');
    expect(STANDARD_CAPABILITY_PROFILES).toContain('planning-decomposition');
  });
});
