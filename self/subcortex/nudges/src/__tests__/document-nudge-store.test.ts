import type { TraceEvidenceReference } from '@nous/shared';
import { describe, expect, it } from 'vitest';
import { DocumentNudgeStore } from '../document-nudge-store.js';
import { createMemoryDocumentStore } from './test-store.js';

const NOW = '2026-03-10T00:00:00.000Z';
const EVIDENCE_REF = {
  actionCategory: 'trace-persist',
  authorizationEventId: '550e8400-e29b-41d4-a716-446655440101',
} as unknown as TraceEvidenceReference;

describe('DocumentNudgeStore', () => {
  it('persists signal, policy, suppression, delivery, and feedback records', async () => {
    const store = new DocumentNudgeStore(createMemoryDocumentStore());

    await store.saveSignal({
      signal_id: '550e8400-e29b-41d4-a716-446655440201',
      signal_type: 'workflow_friction',
      target_scope: 'project',
      source_refs: ['trace:1'],
      evidence_refs: [EVIDENCE_REF],
      created_at: NOW,
    });
    await store.saveRankingPolicy({
      policy_id: '550e8400-e29b-41d4-a716-446655440202',
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
    await store.saveSuppression({
      suppression_id: '550e8400-e29b-41d4-a716-446655440203',
      action: 'snooze',
      scope: 'candidate',
      target_ref: 'candidate-1',
      surface_set: ['discovery_card'],
      reason_codes: ['NDG-SUPPRESSION-SNOOZE-ACTIVE'],
      evidence_refs: [EVIDENCE_REF],
      created_at: NOW,
    });
    await store.saveDelivery({
      delivery_id: '550e8400-e29b-41d4-a716-446655440204',
      candidate_id: 'candidate-1',
      decision_id: 'decision-1',
      surface: 'discovery_card',
      outcome: 'delivered',
      reason_codes: ['NDG-DELIVERY-ALLOWED'],
      evidence_refs: [EVIDENCE_REF],
      delivered_at: NOW,
    });
    await store.saveFeedback({
      feedback_id: '550e8400-e29b-41d4-a716-446655440205',
      candidate_id: 'candidate-1',
      decision_id: 'decision-1',
      event_type: 'accepted',
      surface: 'discovery_card',
      occurred_at: NOW,
      evidence_refs: [EVIDENCE_REF],
    });

    expect(await store.getSignal('550e8400-e29b-41d4-a716-446655440201')).not.toBeNull();
    expect(await store.getRankingPolicyByVersion('2026.03.10')).not.toBeNull();
    expect(await store.listSuppressions()).toHaveLength(1);
    expect(await store.listDeliveriesByCandidate('candidate-1')).toHaveLength(1);
    expect(await store.listFeedbackByCandidate('candidate-1')).toHaveLength(1);
  });
});
