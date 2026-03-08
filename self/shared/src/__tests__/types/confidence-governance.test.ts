/**
 * Confidence-governance schema contract tests.
 * Phase 4.4 and Phase 8.6: confidence mapping, explainability, escalation,
 * Phase 6 export schemas, and runtime evaluation contracts.
 */
import { describe, expect, it } from 'vitest';
import {
  CANONICAL_CONFIDENCE_GOVERNANCE_MAPPING,
  ConfidenceDecayStateSchema,
  ConfidenceGovernanceDecisionOutcomeSchema,
  ConfidenceGovernanceDecisionReasonCodeSchema,
  ConfidenceGovernanceEvaluationInputSchema,
  ConfidenceGovernanceEvaluationResultSchema,
  ConfidenceGovernanceMappingSchema,
  ConfidenceTierSchema,
  EscalationSignalSchema,
  LearnedBehaviorExplanationSchema,
  Phase6ConfidenceSignalExportSchema,
  Phase6DistilledPatternExportSchema,
  Phase6EvidenceLinkageExpectationsSchema,
} from '../../types/confidence-governance.js';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_UUID_2 = '550e8400-e29b-41d4-a716-446655440001';
const VALID_UUID_3 = '550e8400-e29b-41d4-a716-446655440002';
const VALID_TRACE_ID = '550e8400-e29b-41d4-a716-446655440003';

const VALID_EVIDENCE_REF = {
  actionCategory: 'memory-write' as const,
  authorizationEventId: VALID_UUID_2 as never,
};

const EXTRA_EVIDENCE_REF = {
  actionCategory: 'trace-persist' as const,
  completionEventId: VALID_UUID_3 as never,
};

const validPattern = {
  id: VALID_UUID,
  content: 'Pattern content',
  confidence: 0.92,
  basedOn: [VALID_UUID_2],
  supersedes: [VALID_UUID_3],
  evidenceRefs: [VALID_EVIDENCE_REF, EXTRA_EVIDENCE_REF],
  scope: 'project' as const,
  tags: ['tag1'],
  createdAt: '2026-02-27T12:00:00.000Z',
  updatedAt: '2026-02-27T12:00:00.000Z',
};

const validConfidenceSignal = {
  tier: 'high' as const,
  confidence: 0.92,
  supportingSignals: 18,
  patternId: VALID_UUID,
  decayState: 'stable' as const,
};

const validExplanation = {
  patternId: VALID_UUID,
  outcomeRef: 'trace-123',
  evidenceRefs: [VALID_EVIDENCE_REF],
};

const validEscalationSignal = {
  reasonCode: 'CONF-LOW' as const,
  traceId: VALID_TRACE_ID,
  evidenceRefs: [VALID_EVIDENCE_REF],
  patternId: VALID_UUID,
};

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

describe('ConfidenceDecayStateSchema', () => {
  it('accepts stable, decaying, flagged_retirement', () => {
    expect(ConfidenceDecayStateSchema.safeParse('stable').success).toBe(true);
    expect(ConfidenceDecayStateSchema.safeParse('decaying').success).toBe(
      true,
    );
    expect(
      ConfidenceDecayStateSchema.safeParse('flagged_retirement').success,
    ).toBe(true);
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
});

describe('CANONICAL_CONFIDENCE_GOVERNANCE_MAPPING', () => {
  it('has exactly three entries for low, medium, high', () => {
    expect(CANONICAL_CONFIDENCE_GOVERNANCE_MAPPING).toHaveLength(3);
    const tiers = CANONICAL_CONFIDENCE_GOVERNANCE_MAPPING.map((m) => m.tier);
    expect(tiers).toEqual(['low', 'medium', 'high']);
  });

  it('high tier remains the only autonomy-eligible tier and only for may governance', () => {
    const high = CANONICAL_CONFIDENCE_GOVERNANCE_MAPPING.find(
      (mapping) => mapping.tier === 'high',
    );
    const medium = CANONICAL_CONFIDENCE_GOVERNANCE_MAPPING.find(
      (mapping) => mapping.tier === 'medium',
    );

    expect(high?.mayAutonomyAllowed).toBe(true);
    expect(high?.maxGovernanceForAutonomy).toBe('may');
    expect(medium?.mayAutonomyAllowed).toBe(false);
    expect(medium?.shouldFlagDeviations).toBe(true);
  });
});

describe('LearnedBehaviorExplanationSchema', () => {
  it('accepts valid explanation', () => {
    expect(LearnedBehaviorExplanationSchema.safeParse(validExplanation).success)
      .toBe(true);
  });

  it('rejects empty evidenceRefs', () => {
    expect(
      LearnedBehaviorExplanationSchema.safeParse({
        ...validExplanation,
        evidenceRefs: [],
      }).success,
    ).toBe(false);
  });
});

describe('EscalationSignalSchema', () => {
  it('accepts valid signal', () => {
    expect(EscalationSignalSchema.safeParse(validEscalationSignal).success).toBe(
      true,
    );
  });

  it('accepts all reason codes', () => {
    for (const reasonCode of [
      'CONF-LOW',
      'CONF-CONTRADICTION',
      'CONF-STALENESS',
      'CONF-RETIREMENT',
    ] as const) {
      expect(
        EscalationSignalSchema.safeParse({
          ...validEscalationSignal,
          reasonCode,
        }).success,
      ).toBe(true);
    }
  });
});

describe('Phase6 export schemas', () => {
  it('accepts a valid distilled pattern export', () => {
    expect(Phase6DistilledPatternExportSchema.safeParse(validPattern).success)
      .toBe(true);
  });

  it('accepts a valid confidence signal export', () => {
    expect(
      Phase6ConfidenceSignalExportSchema.safeParse(validConfidenceSignal)
        .success,
    ).toBe(true);
  });

  it('accepts evidence linkage expectations', () => {
    expect(
      Phase6EvidenceLinkageExpectationsSchema.safeParse({
        traceLinksRequired: true,
        canonicalRefsRequired: true,
        deterministicLinkage: true,
      }).success,
    ).toBe(true);
  });
});

describe('ConfidenceGovernanceDecision schemas', () => {
  it('accepts all runtime decision outcomes', () => {
    for (const outcome of [
      'allow_autonomy',
      'allow_with_flag',
      'escalate',
      'defer',
      'deny',
    ] as const) {
      expect(ConfidenceGovernanceDecisionOutcomeSchema.safeParse(outcome).success)
        .toBe(true);
    }
  });

  it('accepts all runtime decision reason codes', () => {
    for (const reasonCode of [
      'CGR-ALLOW-AUTONOMY',
      'CGR-ALLOW-WITH-FLAG',
      'CGR-ESCALATE-LOW-CONFIDENCE',
      'CGR-ESCALATE-CONTRADICTION',
      'CGR-ESCALATE-STALENESS',
      'CGR-ESCALATE-RETIREMENT',
      'CGR-DEFER-HIGH-RISK-CONFIRMATION',
      'CGR-DEFER-PAUSED-REVIEW',
      'CGR-DEFER-RESUMING',
      'CGR-DENY-HARD-STOPPED',
      'CGR-DENY-GOVERNANCE-CEILING',
      'CGR-DENY-MISSING-ESCALATION-CONTEXT',
    ] as const) {
      expect(
        ConfidenceGovernanceDecisionReasonCodeSchema.safeParse(reasonCode)
          .success,
      ).toBe(true);
    }
  });
});

describe('ConfidenceGovernanceEvaluationInputSchema', () => {
  const validInput = {
    governance: 'may' as const,
    actionCategory: 'model-invoke' as const,
    projectControlState: 'running' as const,
    pattern: validPattern,
    confidenceSignal: validConfidenceSignal,
    explanation: validExplanation,
  };

  it('accepts a valid runtime evaluation input', () => {
    expect(ConfidenceGovernanceEvaluationInputSchema.safeParse(validInput).success)
      .toBe(true);
  });

  it('rejects mismatched explanation.patternId', () => {
    expect(
      ConfidenceGovernanceEvaluationInputSchema.safeParse({
        ...validInput,
        explanation: {
          ...validExplanation,
          patternId: VALID_UUID_2,
        },
      }).success,
    ).toBe(false);
  });

  it('rejects explanation evidenceRefs that are not present on the canonical pattern', () => {
    expect(
      ConfidenceGovernanceEvaluationInputSchema.safeParse({
        ...validInput,
        explanation: {
          ...validExplanation,
          evidenceRefs: [
            {
              actionCategory: 'opctl-command' as const,
              authorizationEventId: VALID_UUID_3 as never,
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it('rejects mismatched confidenceSignal.patternId', () => {
    expect(
      ConfidenceGovernanceEvaluationInputSchema.safeParse({
        ...validInput,
        confidenceSignal: {
          ...validConfidenceSignal,
          patternId: VALID_UUID_2,
        },
      }).success,
    ).toBe(false);
  });

  it('rejects mismatched escalationSignal.patternId', () => {
    expect(
      ConfidenceGovernanceEvaluationInputSchema.safeParse({
        ...validInput,
        escalationSignal: {
          ...validEscalationSignal,
          patternId: VALID_UUID_2,
        },
      }).success,
    ).toBe(false);
  });
});

describe('ConfidenceGovernanceEvaluationResultSchema', () => {
  const validResult = {
    outcome: 'allow_autonomy' as const,
    reasonCode: 'CGR-ALLOW-AUTONOMY' as const,
    governance: 'may' as const,
    actionCategory: 'model-invoke' as const,
    projectControlState: 'running' as const,
    patternId: VALID_UUID,
    confidence: 0.92,
    confidenceTier: 'high' as const,
    supportingSignals: 18,
    decayState: 'stable' as const,
    autonomyAllowed: true,
    requiresConfirmation: false,
    highRiskOverrideApplied: false,
    evidenceRefs: [VALID_EVIDENCE_REF, EXTRA_EVIDENCE_REF],
    explanation: validExplanation,
  };

  it('accepts a valid autonomy result', () => {
    expect(
      ConfidenceGovernanceEvaluationResultSchema.safeParse(validResult).success,
    ).toBe(true);
  });

  it('rejects autonomy results when autonomyAllowed is false', () => {
    expect(
      ConfidenceGovernanceEvaluationResultSchema.safeParse({
        ...validResult,
        autonomyAllowed: false,
      }).success,
    ).toBe(false);
  });

  it('rejects escalate results without escalationSignal', () => {
    expect(
      ConfidenceGovernanceEvaluationResultSchema.safeParse({
        ...validResult,
        outcome: 'escalate',
        reasonCode: 'CGR-ESCALATE-LOW-CONFIDENCE',
        autonomyAllowed: false,
      }).success,
    ).toBe(false);
  });

  it('rejects high-risk confirmation results with inconsistent flags', () => {
    expect(
      ConfidenceGovernanceEvaluationResultSchema.safeParse({
        ...validResult,
        outcome: 'defer',
        reasonCode: 'CGR-DEFER-HIGH-RISK-CONFIRMATION',
        autonomyAllowed: false,
        requiresConfirmation: false,
        highRiskOverrideApplied: true,
      }).success,
    ).toBe(false);
  });

  it('rejects missing-escalation-context denies that still carry escalationSignal', () => {
    expect(
      ConfidenceGovernanceEvaluationResultSchema.safeParse({
        ...validResult,
        outcome: 'deny',
        reasonCode: 'CGR-DENY-MISSING-ESCALATION-CONTEXT',
        autonomyAllowed: false,
        escalationSignal: validEscalationSignal,
      }).success,
    ).toBe(false);
  });
});
