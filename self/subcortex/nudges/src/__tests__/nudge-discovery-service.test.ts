import type { NudgeRankingRequest, TraceEvidenceReference } from '@nous/shared';
import { describe, expect, it } from 'vitest';
import { DocumentNudgeStore } from '../document-nudge-store.js';
import { NudgeDiscoveryService } from '../nudge-discovery-service.js';
import { RankingPolicyStore } from '../ranking-policy-store.js';
import { createMemoryDocumentStore } from './test-store.js';

const NOW = '2026-03-10T00:00:00.000Z';
const EVIDENCE_REF = {
  actionCategory: 'trace-persist',
  authorizationEventId: '550e8400-e29b-41d4-a716-446655440101',
} as unknown as TraceEvidenceReference;

async function createService() {
  const store = new DocumentNudgeStore(createMemoryDocumentStore());
  const rankingPolicyStore = new RankingPolicyStore(store, { now: () => NOW });
  await rankingPolicyStore.save({
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

  return new NudgeDiscoveryService({
    store,
    rankingPolicyStore,
    now: () => NOW,
    idFactory: (() => {
      const ids = [
        '550e8400-e29b-41d4-a716-446655440201',
        '550e8400-e29b-41d4-a716-446655440202',
        '550e8400-e29b-41d4-a716-446655440203',
        '550e8400-e29b-41d4-a716-446655440204',
      ];
      let sequence = 0;
      return () => ids[sequence++] ?? '550e8400-e29b-41d4-a716-446655440299';
    })(),
  });
}

function buildRankingRequest(): NudgeRankingRequest {
  return {
    policy_version: '2026.03.10',
    surface: 'discovery_card',
    candidates: [
      {
        envelope: {
          candidate: {
            candidate_id: 'candidate-1',
            source_type: 'marketplace_package',
            source_ref: 'pkg.persona-engine',
            origin_trust_tier: 'verified_maintainer',
            compatibility_state: 'compatible',
            target_scope: 'project',
            reason_codes: ['registry-compatible'],
            created_at: NOW,
          },
          discovery_explainability: [],
          reason_codes: ['NDG-CANDIDATE-ELIGIBLE'],
          evidence_refs: [EVIDENCE_REF],
          blocked: false,
        },
        features: {
          relevance: 0.9,
          expected_outcome_gain: 0.6,
          trust_confidence: 0.9,
          compatibility_confidence: 0.9,
          novelty: 0.4,
          fatigue_penalty: 0.05,
          risk_penalty: 0.03,
        },
      },
    ],
  };
}

describe('NudgeDiscoveryService', () => {
  it('records signal, generates candidates, ranks, records delivery/feedback, and routes acceptance', async () => {
    const service = await createService();

    const signal = await service.recordSignal({
      signal_type: 'workflow_friction',
      target_scope: 'project',
      source_refs: ['trace:1'],
      evidence_refs: [EVIDENCE_REF],
    });
    const candidates = await service.generateCandidates({
      signal,
      seeds: [
        {
          candidate: {
            candidate_id: 'candidate-1',
            source_type: 'marketplace_package',
            source_ref: 'pkg.persona-engine',
            origin_trust_tier: 'verified_maintainer',
            compatibility_state: 'compatible',
            target_scope: 'project',
            reason_codes: ['registry-compatible'],
            created_at: NOW,
          },
          discovery_explainability: [],
          registry_eligibility: {
            package_id: 'pkg.persona-engine',
            release_id: 'release-1',
            package_version: '1.0.0',
            trust_tier: 'verified_maintainer',
            distribution_status: 'active',
            compatibility_state: 'compatible',
            metadata_valid: true,
            signer_valid: true,
            requires_principal_override: false,
            block_reason_codes: [],
            evidence_refs: [],
            evaluated_at: NOW,
          },
          evidence_refs: [EVIDENCE_REF],
        },
      ],
    });
    const ranked = await service.rankCandidates(buildRankingRequest());
    const delivery = await service.recordDelivery({
      candidate_id: ranked.decisions[0].decision.candidate_id,
      decision_id: ranked.decisions[0].decision.decision_id,
      surface: 'discovery_card',
      outcome: 'delivered',
      reason_codes: ['NDG-DELIVERY-ALLOWED'],
      evidence_refs: [EVIDENCE_REF],
      delivered_at: NOW,
    });
    const feedback = await service.recordFeedback({
      candidate_id: ranked.decisions[0].decision.candidate_id,
      decision_id: ranked.decisions[0].decision.decision_id,
      event_type: 'accepted',
      surface: 'discovery_card',
      occurred_at: NOW,
      evidence_refs: [EVIDENCE_REF],
    });
    const acceptance = await service.routeAcceptance({
      candidate_id: ranked.decisions[0].decision.candidate_id,
      decision_id: ranked.decisions[0].decision.decision_id,
      source_type: 'marketplace_package',
      source_ref: 'pkg.persona-engine',
      accepted_at: NOW,
      evidence_refs: [EVIDENCE_REF],
    });

    expect(signal.signal_id).toBe('550e8400-e29b-41d4-a716-446655440201');
    expect(candidates.candidates[0].blocked).toBe(false);
    expect(ranked.decisions[0].deliverable).toBe(true);
    expect(delivery.delivery_id).toBe('550e8400-e29b-41d4-a716-446655440203');
    expect(feedback.feedback_id).toBe('550e8400-e29b-41d4-a716-446655440204');
    expect(acceptance.route).toBe('runtime_authorization_required');
  });
});
