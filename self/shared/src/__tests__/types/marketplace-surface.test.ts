import { describe, expect, it } from 'vitest';
import {
  MarketplaceNudgeFeedSnapshotSchema,
  MarketplaceModerationDashboardSnapshotSchema,
  NudgeSuppressionMutationInputSchema,
  RegistryBrowseResultSchema,
  RegistryPackageDetailSnapshotSchema,
} from '../../types/marketplace-surface.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440300';
const RUN_ID = '550e8400-e29b-41d4-a716-446655440301';
const NODE_ID = '550e8400-e29b-41d4-a716-446655440302';
const ESCALATION_ID = '550e8400-e29b-41d4-a716-446655440303';
const NOW = '2026-03-10T00:00:00.000Z';
const EVIDENCE_REF = {
  actionCategory: 'trace-persist',
  authorizationEventId: '550e8400-e29b-41d4-a716-446655440101',
};

describe('RegistryBrowseResultSchema', () => {
  it('parses canonical marketplace browse snapshots', () => {
    const result = RegistryBrowseResultSchema.safeParse({
      query: {
        query: 'persona',
        trustTiers: ['verified_maintainer'],
        distributionStatuses: ['active'],
        compatibilityStates: ['compatible'],
        page: 1,
        pageSize: 20,
        projectId: PROJECT_ID,
      },
      items: [
        {
          package: {
            package_id: 'pkg.persona-engine',
            package_type: 'project',
            display_name: 'Persona Engine',
            latest_release_id: 'release-1',
            trust_tier: 'verified_maintainer',
            distribution_status: 'active',
            compatibility_state: 'compatible',
            maintainer_ids: ['maintainer:1'],
            evidence_refs: [],
            created_at: NOW,
            updated_at: NOW,
          },
          latestRelease: {
            release_id: 'release-1',
            package_id: 'pkg.persona-engine',
            package_version: '1.0.0',
            origin_class: 'third_party_external',
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
              metadata_expires_at: '2027-03-12T00:00:00.000Z',
              artifact_digest: 'sha256:abc123',
              metadata_digest: 'sha256:def456',
            },
            distribution_status: 'active',
            compatibility_state: 'compatible',
            evidence_refs: [],
            published_at: NOW,
          },
          maintainers: [
            {
              maintainer_id: 'maintainer:1',
              display_name: 'Maintainer 1',
              verification_state: 'verified_individual',
              roles: ['owner'],
              signer_key_ids: ['key-1'],
              evidence_refs: [],
              verified_at: NOW,
              updated_at: NOW,
            },
          ],
          trustEligibility: {
            project_id: PROJECT_ID,
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
            evidence_refs: ['witness:evt-1'],
            evaluated_at: NOW,
          },
          deepLinks: [
            {
              target: 'projects',
              packageId: 'pkg.persona-engine',
              projectId: PROJECT_ID,
              workflowRunId: RUN_ID,
              nodeDefinitionId: NODE_ID,
            },
          ],
        },
      ],
      totalCount: 1,
      generatedAt: NOW,
    });

    expect(result.success).toBe(true);
  });
});

describe('RegistryPackageDetailSnapshotSchema', () => {
  it('parses detail snapshots with governance and appeal history', () => {
    const result = RegistryPackageDetailSnapshotSchema.safeParse({
      package: {
        package_id: 'pkg.persona-engine',
        package_type: 'project',
        display_name: 'Persona Engine',
        latest_release_id: 'release-1',
        trust_tier: 'verified_maintainer',
        distribution_status: 'active',
        compatibility_state: 'compatible',
        maintainer_ids: ['maintainer:1'],
        evidence_refs: [],
        created_at: NOW,
        updated_at: NOW,
      },
      latestRelease: null,
      releases: [],
      maintainers: [],
      governanceTimeline: [
        {
          action_id: 'action-1',
          action_type: 'verify_maintainer',
          maintainer_id: 'maintainer:1',
          actor_id: 'principal',
          reason_code: 'MKT-006-DISTRIBUTION_BLOCKED',
          target_verification_state: 'verified_individual',
          witness_ref: 'evt-1',
          evidence_refs: ['witness:evt-1'],
          created_at: NOW,
        },
      ],
      appeals: [
        {
          appeal_id: 'appeal-1',
          package_id: 'pkg.persona-engine',
          maintainer_id: 'maintainer:1',
          submitted_reason: 'Request reinstatement',
          submitted_evidence_refs: ['witness:evt-1'],
          status: 'submitted',
          created_at: NOW,
          updated_at: NOW,
        },
      ],
      trustEligibility: null,
      deepLinks: [],
      generatedAt: NOW,
    });

    expect(result.success).toBe(true);
  });
});

describe('MarketplaceModerationDashboardSnapshotSchema', () => {
  it('parses moderation dashboard rows with escalation continuity', () => {
    const result = MarketplaceModerationDashboardSnapshotSchema.safeParse({
      rows: [
        {
          package: {
            package_id: 'pkg.persona-engine',
            package_type: 'project',
            display_name: 'Persona Engine',
            latest_release_id: 'release-1',
            trust_tier: 'verified_maintainer',
            distribution_status: 'hold',
            compatibility_state: 'compatible',
            maintainer_ids: ['maintainer:1'],
            moderation_state: 'distribution_hold',
            evidence_refs: [],
            created_at: NOW,
            updated_at: NOW,
          },
          latestRelease: null,
          latestGovernanceAction: null,
          latestAppeal: null,
          escalationIds: [ESCALATION_ID],
          deepLinks: [],
        },
      ],
      pendingAppealCount: 1,
      activeHoldCount: 1,
      delistedCount: 0,
      generatedAt: NOW,
    });

    expect(result.success).toBe(true);
  });
});

describe('MarketplaceNudgeFeedSnapshotSchema', () => {
  it('parses delivery cards and blocked deliveries', () => {
    const result = MarketplaceNudgeFeedSnapshotSchema.safeParse({
      projectId: PROJECT_ID,
      surface: 'cli_suggestion',
      cards: [
        {
          candidate: {
            candidate_id: 'candidate-1',
            source_type: 'marketplace_package',
            source_ref: 'pkg.persona-engine',
            origin_trust_tier: 'verified_maintainer',
            compatibility_state: 'compatible',
            target_scope: 'project',
            reason_codes: ['NDG-CANDIDATE-ELIGIBLE'],
            created_at: NOW,
          },
          decision: {
            decision_id: 'decision-1',
            candidate_id: 'candidate-1',
            rank_score: 0.8,
            rank_components_ref: 'rank:1',
            suppression_state: 'eligible',
            delivery_surface_set: ['cli_suggestion'],
            expires_at: NOW,
          },
          delivery: {
            delivery_id: '550e8400-e29b-41d4-a716-446655440204',
            candidate_id: 'candidate-1',
            decision_id: 'decision-1',
            surface: 'cli_suggestion',
            outcome: 'delivered',
            reason_codes: ['NDG-DELIVERY-ALLOWED'],
            evidence_refs: [EVIDENCE_REF],
            delivered_at: NOW,
          },
          trustEligibility: null,
          whyThis: ['workflow friction detected'],
          availableSuppressionActions: [
            'dismiss_once',
            'snooze',
            'mute_category',
            'mute_project',
            'mute_global',
          ],
          activeSuppressions: [],
          deepLinks: [],
        },
      ],
      blockedDeliveries: [],
      generatedAt: NOW,
    });

    expect(result.success).toBe(true);
  });
});

describe('NudgeSuppressionMutationInputSchema', () => {
  it('requires at least one evidence ref for suppression mutations', () => {
    const result = NudgeSuppressionMutationInputSchema.safeParse({
      candidateId: 'candidate-1',
      action: 'mute_global',
      scope: 'global',
      targetRef: 'global',
      surface: 'discovery_card',
      evidenceRefs: [],
      occurredAt: NOW,
    });

    expect(result.success).toBe(false);
  });
});
