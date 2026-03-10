import { describe, expect, it } from 'vitest';
import {
  NudgeCandidateSchema,
  NudgeDecisionSchema,
  NudgeFeedbackEventSchema,
  NudgeSignalSchema,
} from '../../types/nudge.js';

const NOW = '2026-03-10T00:00:00.000Z';

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
      delivery_surface_set: ['chat'],
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
      surface: 'chat',
      occurred_at: NOW,
    });

    expect(result.success).toBe(true);
  });
});
