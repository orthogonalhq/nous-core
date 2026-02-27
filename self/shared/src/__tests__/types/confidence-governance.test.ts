/**
 * Confidence-governance schema contract tests.
 * Phase 4.4: ConfidenceTier, ConfidenceGovernanceMapping, LearnedBehaviorExplanation,
 * EscalationSignal, Phase6 export schemas.
 */
import { describe, it, expect } from 'vitest';
import {
  ConfidenceTierSchema,
  ConfidenceGovernanceMappingSchema,
  LearnedBehaviorExplanationSchema,
  EscalationSignalSchema,
  Phase6DistilledPatternExportSchema,
  Phase6ConfidenceSignalExportSchema,
  Phase6EvidenceLinkageExpectationsSchema,
  CANONICAL_CONFIDENCE_GOVERNANCE_MAPPING,
  HIGH_RISK_ACTION_CATEGORIES,
} from '../../types/confidence-governance.js';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_UUID_2 = '550e8400-e29b-41d4-a716-446655440001';
const VALID_TRACE_ID = '550e8400-e29b-41d4-a716-446655440002';

const VALID_EVIDENCE_REF = { actionCategory: 'memory-write' as const };

describe('ConfidenceTierSchema', () => {
  it('accepts low, medium, high', () => {
    expect(ConfidenceTierSchema.safeParse('low').success).toBe(true);
    expect(ConfidenceTierSchema.safeParse('medium').success).toBe(true);
    expect(ConfidenceTierSchema.safeParse('high').success).toBe(true);
  });

  it('rejects invalid tier', () => {
    expect(ConfidenceTierSchema.safeParse('invalid').success).toBe(false);
  });
});

describe('ConfidenceGovernanceMappingSchema', () => {
  it('accepts valid low tier mapping', () => {
    const result = ConfidenceGovernanceMappingSchema.safeParse({
      tier: 'low',
      escalationRequired: true,
      mayAutonomyAllowed: false,
      shouldFlagDeviations: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid high tier mapping with maxGovernanceForAutonomy', () => {
    const result = ConfidenceGovernanceMappingSchema.safeParse({
      tier: 'high',
      escalationRequired: false,
      mayAutonomyAllowed: true,
      shouldFlagDeviations: false,
      maxGovernanceForAutonomy: 'may',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid governance level', () => {
    const result = ConfidenceGovernanceMappingSchema.safeParse({
      tier: 'high',
      escalationRequired: false,
      mayAutonomyAllowed: true,
      shouldFlagDeviations: false,
      maxGovernanceForAutonomy: 'invalid',
    });
    expect(result.success).toBe(false);
  });
});

describe('CANONICAL_CONFIDENCE_GOVERNANCE_MAPPING', () => {
  it('has exactly three entries for low, medium, high', () => {
    expect(CANONICAL_CONFIDENCE_GOVERNANCE_MAPPING).toHaveLength(3);
    const tiers = CANONICAL_CONFIDENCE_GOVERNANCE_MAPPING.map((m) => m.tier);
    expect(tiers).toContain('low');
    expect(tiers).toContain('medium');
    expect(tiers).toContain('high');
  });

  it('low tier has escalationRequired=true, mayAutonomyAllowed=false', () => {
    const low = CANONICAL_CONFIDENCE_GOVERNANCE_MAPPING.find(
      (m) => m.tier === 'low',
    );
    expect(low?.escalationRequired).toBe(true);
    expect(low?.mayAutonomyAllowed).toBe(false);
  });

  it('high tier has mayAutonomyAllowed=true, maxGovernanceForAutonomy=may', () => {
    const high = CANONICAL_CONFIDENCE_GOVERNANCE_MAPPING.find(
      (m) => m.tier === 'high',
    );
    expect(high?.mayAutonomyAllowed).toBe(true);
    expect(high?.maxGovernanceForAutonomy).toBe('may');
  });

  it('all entries parse as ConfidenceGovernanceMappingSchema', () => {
    for (const entry of CANONICAL_CONFIDENCE_GOVERNANCE_MAPPING) {
      expect(
        ConfidenceGovernanceMappingSchema.safeParse(entry).success,
      ).toBe(true);
    }
  });
});

describe('LearnedBehaviorExplanationSchema', () => {
  const valid = {
    patternId: VALID_UUID,
    outcomeRef: 'trace-123',
    evidenceRefs: [VALID_EVIDENCE_REF],
  };

  it('accepts valid explanation', () => {
    expect(LearnedBehaviorExplanationSchema.safeParse(valid).success).toBe(
      true,
    );
  });

  it('accepts with optional refs', () => {
    const withRefs = {
      ...valid,
      distillationRef: 'cluster-1',
      policyRef: VALID_TRACE_ID,
      controlStateRef: 'snapshot-1',
    };
    expect(LearnedBehaviorExplanationSchema.safeParse(withRefs).success).toBe(
      true,
    );
  });

  it('rejects empty evidenceRefs', () => {
    expect(
      LearnedBehaviorExplanationSchema.safeParse({
        ...valid,
        evidenceRefs: [],
      }).success,
    ).toBe(false);
  });

  it('rejects empty outcomeRef', () => {
    expect(
      LearnedBehaviorExplanationSchema.safeParse({
        ...valid,
        outcomeRef: '',
      }).success,
    ).toBe(false);
  });
});

describe('EscalationSignalSchema', () => {
  const valid = {
    reasonCode: 'CONF-LOW' as const,
    traceId: VALID_TRACE_ID,
    evidenceRefs: [VALID_EVIDENCE_REF],
  };

  it('accepts valid signal', () => {
    expect(EscalationSignalSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts all reason codes', () => {
    const codes: Array<'CONF-LOW' | 'CONF-CONTRADICTION' | 'CONF-STALENESS' | 'CONF-RETIREMENT'> = [
      'CONF-LOW',
      'CONF-CONTRADICTION',
      'CONF-STALENESS',
      'CONF-RETIREMENT',
    ];
    for (const code of codes) {
      expect(
        EscalationSignalSchema.safeParse({
          ...valid,
          reasonCode: code,
        }).success,
      ).toBe(true);
    }
  });

  it('rejects invalid reasonCode', () => {
    expect(
      EscalationSignalSchema.safeParse({
        ...valid,
        reasonCode: 'INVALID',
      }).success,
    ).toBe(false);
  });

  it('rejects empty evidenceRefs', () => {
    expect(
      EscalationSignalSchema.safeParse({
        ...valid,
        evidenceRefs: [],
      }).success,
    ).toBe(false);
  });
});

describe('Phase6DistilledPatternExportSchema', () => {
  const valid = {
    id: VALID_UUID,
    content: 'Pattern content',
    confidence: 0.9,
    basedOn: [VALID_UUID_2],
    supersedes: [VALID_UUID_2],
    evidenceRefs: [VALID_EVIDENCE_REF],
    scope: 'project' as const,
    tags: ['tag1'],
    createdAt: '2026-02-27T12:00:00.000Z',
    updatedAt: '2026-02-27T12:00:00.000Z',
  };

  it('accepts valid export', () => {
    expect(Phase6DistilledPatternExportSchema.safeParse(valid).success).toBe(
      true,
    );
  });

  it('rejects confidence > 1', () => {
    expect(
      Phase6DistilledPatternExportSchema.safeParse({
        ...valid,
        confidence: 1.1,
      }).success,
    ).toBe(false);
  });
});

describe('Phase6ConfidenceSignalExportSchema', () => {
  const valid = {
    tier: 'high' as const,
    confidence: 0.92,
    supportingSignals: 18,
  };

  it('accepts valid export', () => {
    expect(Phase6ConfidenceSignalExportSchema.safeParse(valid).success).toBe(
      true,
    );
  });

  it('accepts decayState values', () => {
    for (const state of ['stable', 'decaying', 'flagged_retirement'] as const) {
      expect(
        Phase6ConfidenceSignalExportSchema.safeParse({
          ...valid,
          decayState: state,
        }).success,
      ).toBe(true);
    }
  });
});

describe('Phase6EvidenceLinkageExpectationsSchema', () => {
  it('accepts valid expectations', () => {
    expect(
      Phase6EvidenceLinkageExpectationsSchema.safeParse({
        traceLinksRequired: true,
        canonicalRefsRequired: true,
        deterministicLinkage: true,
      }).success,
    ).toBe(true);
  });
});

describe('HIGH_RISK_ACTION_CATEGORIES', () => {
  it('includes tool-execute, memory-write, opctl-command', () => {
    expect(HIGH_RISK_ACTION_CATEGORIES).toContain('tool-execute');
    expect(HIGH_RISK_ACTION_CATEGORIES).toContain('memory-write');
    expect(HIGH_RISK_ACTION_CATEGORIES).toContain('opctl-command');
  });

  it('has exactly three categories', () => {
    expect(HIGH_RISK_ACTION_CATEGORIES).toHaveLength(3);
  });
});
