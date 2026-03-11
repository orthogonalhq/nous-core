import { describe, expect, it } from 'vitest';
import {
  NudgeAcceptanceRouteResultSchema,
  NudgeCandidateSchema,
  NudgeDecisionSchema,
  NudgeDeliveryRecordSchema,
  NudgeFeedbackEventSchema,
  NudgeFeedbackRecordSchema,
  NudgeRankedDecisionSchema,
  NudgeRankingPolicySchema,
  NudgeSignalSchema,
  NudgeSuppressionCheckResultSchema,
  NudgeSuppressionRecordSchema,
} from '../../types/nudge.js';
import {
  MarketplaceNudgeFeedSnapshotSchema,
  NudgeSuppressionMutationInputSchema,
  NudgeSuppressionQueryResultSchema,
} from '../../types/marketplace-surface.js';

const NOW = '2026-03-10T00:00:00.000Z';
const EVIDENCE_REF = {
  actionCategory: 'trace-persist',
  authorizationEventId: '550e8400-e29b-41d4-a716-446655440101',
};

describe('NudgeSignalSchema', () => {
  it('parses workflow-friction signals', () => {
    const result = NudgeSignalSchema.safeParse({
      signal_id: 'signal-1',
      signal_type: 'workflow_friction',
      target_scope: 'project',
      source_refs: ['trace:1'],
      created_at: NOW,
    });

    expect(result.success).toBe(true);
  });
});

describe('NudgeCandidateSchema', () => {
  it('parses registry-backed candidates', () => {
    const result = NudgeCandidateSchema.safeParse({
      candidate_id: 'candidate-1',
      source_type: 'marketplace_package',
      source_ref: 'pkg.persona-engine',
      origin_trust_tier: 'verified_maintainer',
      compatibility_state: 'compatible',
      target_scope: 'project',
      reason_codes: ['registry-compatible'],
      created_at: NOW,
    });

    expect(result.success).toBe(true);
  });
});

describe('NudgeDecisionSchema', () => {
  it('parses advisory decision records', () => {
    const result = NudgeDecisionSchema.safeParse({
      decision_id: 'decision-1',
      candidate_id: 'candidate-1',
      rank_score: 0.82,
      rank_components_ref: 'rank:1',
      suppression_state: 'eligible',
      delivery_surface_set: ['discovery_card'],
      expires_at: NOW,
    });

    expect(result.success).toBe(true);
  });
});

describe('NudgeFeedbackEventSchema', () => {
  it('parses user feedback events', () => {
    const result = NudgeFeedbackEventSchema.safeParse({
      feedback_id: 'feedback-1',
      candidate_id: 'candidate-1',
      event_type: 'dismissed',
      surface: 'discovery_card',
      occurred_at: NOW,
    });

    expect(result.success).toBe(true);
  });
});

describe('NudgeRankingPolicySchema', () => {
  it('parses governed ranking policies', () => {
    const result = NudgeRankingPolicySchema.safeParse({
      policy_id: '550e8400-e29b-41d4-a716-446655440201',
      version: '2026.03.10',
      scoring_weights: {
        relevance: 0.4,
        expected_outcome_gain: 0.2,
        trust_confidence: 0.1,
        compatibility_confidence: 0.1,
        novelty: 0.15,
        fatigue_penalty: 0.03,
        risk_penalty: 0.02,
      },
      approval_evidence_ref: 'approval:1',
      witness_ref: 'witness:1',
      effective_at: NOW,
    });

    expect(result.success).toBe(true);
  });
});

describe('NudgeRankedDecisionSchema', () => {
  it('parses ranked decisions with evidence linkage', () => {
    const result = NudgeRankedDecisionSchema.safeParse({
      decision: {
        decision_id: 'decision-1',
        candidate_id: 'candidate-1',
        rank_score: 0.79,
        rank_components_ref: 'rank:1',
        suppression_state: 'eligible',
        delivery_surface_set: ['cli_suggestion'],
        expires_at: NOW,
      },
      policy_version: '2026.03.10',
      components: {
        relevance: 0.5,
        expected_outcome_gain: 0.2,
        trust_confidence: 0.1,
        compatibility_confidence: 0.1,
        novelty: 0.2,
        fatigue_penalty: 0.03,
        risk_penalty: 0.02,
        final_score: 0.79,
      },
      reason_codes: ['NDG-RANK-POLICY-VERSION-APPLIED'],
      evidence_refs: [EVIDENCE_REF],
      deliverable: true,
    });

    expect(result.success).toBe(true);
  });
});

describe('NudgeSuppressionRecordSchema', () => {
  it('parses durable suppression records', () => {
    const result = NudgeSuppressionRecordSchema.safeParse({
      suppression_id: '550e8400-e29b-41d4-a716-446655440202',
      action: 'snooze',
      scope: 'candidate',
      target_ref: 'candidate-1',
      surface_set: ['discovery_card', 'cli_suggestion'],
      reason_codes: ['NDG-SUPPRESSION-SNOOZE-ACTIVE'],
      evidence_refs: [EVIDENCE_REF],
      created_at: NOW,
      expires_at: '2026-03-11T00:00:00.000Z',
    });

    expect(result.success).toBe(true);
  });
});

describe('NudgeSuppressionCheckResultSchema', () => {
  it('requires evidence linkage for suppression checks', () => {
    const result = NudgeSuppressionCheckResultSchema.safeParse({
      candidate_id: 'candidate-1',
      blocked: true,
      matched_suppressions: [],
      reason_codes: ['NDG-SUPPRESSION-MUTED-GLOBAL'],
      evidence_refs: [],
      checked_at: NOW,
    });

    expect(result.success).toBe(false);
  });
});

describe('NudgeDeliveryRecordSchema', () => {
  it('parses delivery blocks as first-class records', () => {
    const result = NudgeDeliveryRecordSchema.safeParse({
      delivery_id: '550e8400-e29b-41d4-a716-446655440203',
      candidate_id: 'candidate-1',
      decision_id: 'decision-1',
      surface: 'communication_gateway',
      outcome: 'delivery_blocked',
      reason_codes: ['NDG-DELIVERY-BLOCKED-SUPPRESSION'],
      evidence_refs: [EVIDENCE_REF],
      delivered_at: NOW,
    });

    expect(result.success).toBe(true);
  });
});

describe('NudgeFeedbackRecordSchema', () => {
  it('parses auditable feedback records', () => {
    const result = NudgeFeedbackRecordSchema.safeParse({
      feedback_id: 'feedback-1',
      candidate_id: 'candidate-1',
      decision_id: 'decision-1',
      delivery_id: '550e8400-e29b-41d4-a716-446655440203',
      event_type: 'accepted',
      surface: 'discovery_card',
      occurred_at: NOW,
      evidence_refs: [EVIDENCE_REF],
    });

    expect(result.success).toBe(true);
  });
});

describe('NudgeAcceptanceRouteResultSchema', () => {
  it('parses advisory-only acceptance route results', () => {
    const result = NudgeAcceptanceRouteResultSchema.safeParse({
      route: 'runtime_authorization_required',
      lifecycle_request_ref: 'lifecycle-intent:candidate-1',
      reason_codes: ['NDG-ACCEPTANCE-ROUTED-RUNTIME-AUTH'],
      evidence_refs: [EVIDENCE_REF],
    });

    expect(result.success).toBe(true);
  });
});

describe('Marketplace nudge feed and suppression schemas', () => {
  it('parses active suppression query results', () => {
    const result = NudgeSuppressionQueryResultSchema.safeParse({
      suppressions: [],
      generatedAt: NOW,
    });

    expect(result.success).toBe(true);
  });

  it('parses marketplace feed wrappers and suppression mutations', () => {
    const feed = MarketplaceNudgeFeedSnapshotSchema.safeParse({
      surface: 'discovery_card',
      cards: [],
      blockedDeliveries: [],
      generatedAt: NOW,
    });
    const mutation = NudgeSuppressionMutationInputSchema.safeParse({
      candidateId: 'candidate-1',
      decisionId: 'decision-1',
      action: 'snooze',
      scope: 'candidate',
      targetRef: 'candidate-1',
      surface: 'discovery_card',
      durationMinutes: 30,
      evidenceRefs: [EVIDENCE_REF],
      occurredAt: NOW,
    });

    expect(feed.success).toBe(true);
    expect(mutation.success).toBe(true);
  });
});
