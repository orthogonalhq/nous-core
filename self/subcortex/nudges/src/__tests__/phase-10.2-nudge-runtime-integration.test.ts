import type { ProjectId, TraceEvidenceReference } from '@nous/shared';
import { describe, expect, it } from 'vitest';
import { DeliveryEvaluator } from '../delivery-evaluator.js';
import { DocumentNudgeStore } from '../document-nudge-store.js';
import { NudgeDiscoveryService } from '../nudge-discovery-service.js';
import { RankingPolicyStore } from '../ranking-policy-store.js';
import { SuppressionStore } from '../suppression-store.js';
import { createMemoryDocumentStore } from './test-store.js';

const NOW = '2026-03-10T00:00:00.000Z';
const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440301' as ProjectId;
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

  return {
    store,
    service: new NudgeDiscoveryService({
      store,
      rankingPolicyStore,
      now: () => NOW,
      idFactory: (() => {
        const ids = [
          '550e8400-e29b-41d4-a716-446655440301',
          '550e8400-e29b-41d4-a716-446655440302',
          '550e8400-e29b-41d4-a716-446655440303',
        ];
        let sequence = 0;
        return () => ids[sequence++] ?? '550e8400-e29b-41d4-a716-446655440399';
      })(),
    }),
  };
}

describe('Phase 10.2 nudge runtime integration', () => {
  it('keeps ineligible registry candidates blocked even with strong ranking inputs', async () => {
    const { service } = await createService();

    const signal = await service.recordSignal({
      signal_type: 'missing_capability',
      target_scope: 'project',
      source_refs: ['trace:1'],
      evidence_refs: [EVIDENCE_REF],
    });
    const generated = await service.generateCandidates({
      signal,
      seeds: [
        {
          candidate: {
            candidate_id: 'candidate-1',
            source_type: 'marketplace_package',
            source_ref: 'pkg.blocked',
            origin_trust_tier: 'community_unverified',
            compatibility_state: 'blocked_incompatible',
            target_scope: 'project',
            reason_codes: [],
            created_at: NOW,
          },
          discovery_explainability: [],
          registry_eligibility: {
            project_id: PROJECT_ID,
            package_id: 'pkg.blocked',
            release_id: 'release-1',
            package_version: '1.0.0',
            trust_tier: 'community_unverified',
            distribution_status: 'blocked',
            compatibility_state: 'blocked_incompatible',
            metadata_valid: true,
            signer_valid: true,
            requires_principal_override: false,
            block_reason_codes: ['MKT-007-COMPATIBILITY_BLOCKED'],
            evidence_refs: [],
            evaluated_at: NOW,
          },
          evidence_refs: [EVIDENCE_REF],
        },
      ],
    });
    const ranked = await service.rankCandidates({
      policy_version: '2026.03.10',
      surface: 'discovery_card',
      candidates: [
        {
          envelope: generated.candidates[0],
          features: {
            relevance: 1,
            expected_outcome_gain: 1,
            trust_confidence: 1,
            compatibility_confidence: 1,
            novelty: 1,
            fatigue_penalty: 0,
            risk_penalty: 0,
          },
        },
      ],
    });

    expect(generated.candidates[0].reason_codes).toContain('NDG-CANDIDATE-BLOCKED-REGISTRY');
    expect(generated.candidates[0].reason_codes).toContain(
      'NDG-CANDIDATE-BLOCKED-COMPATIBILITY',
    );
    expect(ranked.decisions[0].deliverable).toBe(false);
  });

  it('treats policy-denied input as hard suppression and blocks delivery', async () => {
    const { service, store } = await createService();
    const suppressionStore = new SuppressionStore(store);
    const deliveryEvaluator = new DeliveryEvaluator({
      now: () => NOW,
      idFactory: (() => {
        const ids = ['550e8400-e29b-41d4-a716-446655440450'];
        let sequence = 0;
        return () => ids[sequence++] ?? '550e8400-e29b-41d4-a716-446655440499';
      })(),
    });

    await suppressionStore.save({
      suppression_id: '550e8400-e29b-41d4-a716-446655440250',
      action: 'mute_project',
      scope: 'project',
      target_ref: PROJECT_ID,
      surface_set: ['discovery_card'],
      reason_codes: ['NDG-SUPPRESSION-MUTED-PROJECT'],
      evidence_refs: [EVIDENCE_REF],
      created_at: NOW,
    });

    const signal = await service.recordSignal({
      signal_type: 'manual_workaround',
      target_scope: 'project',
      source_refs: ['trace:2'],
      requesting_project_id: PROJECT_ID,
      evidence_refs: [EVIDENCE_REF],
    });
    const generated = await service.generateCandidates({
      signal,
      seeds: [
        {
          candidate: {
            candidate_id: 'candidate-2',
            source_type: 'runtime_tip',
            source_ref: 'tip:automation',
            origin_trust_tier: 'nous_first_party',
            compatibility_state: 'compatible',
            target_scope: 'project',
            reason_codes: [],
            created_at: NOW,
          },
          discovery_explainability: [],
          discovery_policy: {
            deniedProjectCount: 1,
            reasonCodes: ['POL-DENIED'],
            controlState: 'running',
          },
          evidence_refs: [EVIDENCE_REF],
        },
      ],
    });
    const ranked = await service.rankCandidates({
      policy_version: '2026.03.10',
      surface: 'discovery_card',
      candidates: [
        {
          envelope: generated.candidates[0],
          features: {
            relevance: 0.9,
            expected_outcome_gain: 0.6,
            trust_confidence: 0.8,
            compatibility_confidence: 0.9,
            novelty: 0.4,
            fatigue_penalty: 0.05,
            risk_penalty: 0.03,
          },
        },
      ],
    });
    const suppression = await service.evaluateSuppression({
      candidate: generated.candidates[0].candidate,
      surface: 'discovery_card',
      requesting_project_id: PROJECT_ID,
      evidence_refs: [EVIDENCE_REF],
    });
    const delivery = deliveryEvaluator.evaluate({
      rankedDecision: ranked.decisions[0],
      suppressionCheck: suppression,
      surface: 'discovery_card',
    });

    expect(generated.candidates[0].reason_codes).toContain(
      'NDG-CANDIDATE-BLOCKED-POLICY-DENIAL',
    );
    expect(suppression.reason_codes).toContain('NDG-SUPPRESSION-MUTED-PROJECT');
    expect(delivery.outcome).toBe('delivery_blocked');
  });
});
