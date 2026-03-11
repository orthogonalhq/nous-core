import type { NudgeRankingRequest, TraceEvidenceReference } from '@nous/shared';
import { describe, expect, it } from 'vitest';
import { DocumentRegistryStore } from '@nous/subcortex-registry';
import { RegistryService } from '@nous/subcortex-registry';
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
  const documentStore = createMemoryDocumentStore();
  const store = new DocumentNudgeStore(documentStore);
  const rankingPolicyStore = new RankingPolicyStore(store, { now: () => NOW });
  const registryService = new RegistryService({
    registryStore: new DocumentRegistryStore(documentStore),
    now: () => NOW,
    idFactory: (() => {
      const ids = [
        'release-1',
        'release-2',
        'release-3',
      ];
      let sequence = 0;
      return () => ids[sequence++] ?? `release-${sequence}`;
    })(),
  });
  await registryService.submitRelease({
    package_id: 'pkg.persona-engine',
    package_type: 'project',
    display_name: 'Persona Engine',
    package_version: '1.0.0',
    origin_class: 'third_party_external',
    registered: true,
    signing_key_id: 'key-1',
    signature_set_ref: 'sigset-1',
    source_hash: 'sha256:abc123',
    compatibility: {
      api_contract_range: '^1.0.0',
      capability_manifest: ['model.invoke'],
      migration_contract_version: '1',
      data_schema_versions: ['1'],
      policy_profile_defaults: [],
    },
    metadata_chain: {
      root_version: 1,
      timestamp_version: 1,
      snapshot_version: 1,
      targets_version: 1,
      trusted_root_key_ids: ['root-a'],
      delegated_key_ids: [],
      metadata_expires_at: '2026-03-12T00:00:00.000Z',
      artifact_digest: 'sha256:abc123',
      metadata_digest: 'sha256:def456',
    },
    maintainer_ids: ['maintainer:1'],
    published_at: NOW,
  });
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
    registryService,
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

  it('prepares a canonical feed and persists suppression plus matching feedback', async () => {
    const service = await createService();

    await service.recordSignal({
      signal_type: 'workflow_friction',
      target_scope: 'project',
      source_refs: ['persona'],
      evidence_refs: [EVIDENCE_REF],
    });

    const feed = await service.prepareSurfaceFeed({
      projectId: '550e8400-e29b-41d4-a716-446655440301' as any,
      surface: 'cli_suggestion',
      signalRefs: ['persona'],
      limit: 3,
    });

    expect(feed.cards).toHaveLength(1);
    expect(feed.cards[0].trustEligibility?.project_id).toBe(
      '550e8400-e29b-41d4-a716-446655440301',
    );

    const suppression = await service.applySuppression({
      candidateId: feed.cards[0].candidate.candidate_id,
      decisionId: feed.cards[0].decision.decision_id,
      action: 'snooze',
      scope: 'candidate',
      targetRef: feed.cards[0].candidate.candidate_id,
      projectId: '550e8400-e29b-41d4-a716-446655440301' as any,
      surface: 'cli_suggestion',
      durationMinutes: 30,
      evidenceRefs: [EVIDENCE_REF],
      occurredAt: NOW,
    });
    const suppressions = await service.listSuppressions({
      projectId: '550e8400-e29b-41d4-a716-446655440301' as any,
      surface: 'cli_suggestion',
      candidateId: feed.cards[0].candidate.candidate_id,
    });
    const blockedFeed = await service.prepareSurfaceFeed({
      projectId: '550e8400-e29b-41d4-a716-446655440301' as any,
      surface: 'cli_suggestion',
      signalRefs: ['persona'],
      limit: 3,
    });

    expect(suppression.action).toBe('snooze');
    expect(suppressions.suppressions).toHaveLength(1);
    expect(blockedFeed.cards).toHaveLength(0);
    expect(blockedFeed.blockedDeliveries.length).toBeGreaterThan(0);
  });
});
