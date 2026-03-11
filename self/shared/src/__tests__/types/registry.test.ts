import { describe, expect, it } from 'vitest';
import {
  RegistryAppealRecordSchema,
  RegistryGovernanceActionSchema,
  RegistryInstallEligibilitySnapshotSchema,
  RegistryMetadataValidationResultSchema,
  RegistryReleaseSubmissionInputSchema,
} from '../../types/registry.js';
import {
  RegistryAppealQueryResultSchema,
  RegistryBrowseResultSchema,
  RegistryGovernanceTimelineResultSchema,
  RegistryPackageDetailSnapshotSchema,
} from '../../types/marketplace-surface.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440300';
const NOW = '2026-03-10T00:00:00.000Z';

describe('RegistryReleaseSubmissionInputSchema', () => {
  it('parses canonical submission input', () => {
    const result = RegistryReleaseSubmissionInputSchema.safeParse({
      project_id: PROJECT_ID,
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
        policy_profile_defaults: ['default'],
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

    expect(result.success).toBe(true);
  });
});

describe('RegistryInstallEligibilitySnapshotSchema', () => {
  it('captures block posture and evidence linkage', () => {
    const result = RegistryInstallEligibilitySnapshotSchema.safeParse({
      project_id: PROJECT_ID,
      package_id: 'pkg.persona-engine',
      release_id: 'release-1',
      package_version: '1.0.0',
      trust_tier: 'unregistered_external',
      distribution_status: 'blocked',
      compatibility_state: 'blocked_incompatible',
      metadata_valid: false,
      signer_valid: false,
      requires_principal_override: true,
      block_reason_codes: [
        'MKT-002-UNREGISTERED_EXTERNAL',
        'MKT-004-PRINCIPAL_OVERRIDE_REQUIRED',
      ],
      evidence_refs: ['witness:evt-1'],
      evaluated_at: NOW,
    });

    expect(result.success).toBe(true);
  });
});

describe('RegistryMetadataValidationResultSchema', () => {
  it('accepts registry metadata reason codes', () => {
    const result = RegistryMetadataValidationResultSchema.safeParse({
      valid: false,
      signer_valid: false,
      fresh: false,
      reason_codes: [
        'MKT-008-METADATA_REPLAYED',
        'MKT-008-SIGNER_REVOKED',
      ],
      checked_at: NOW,
    });

    expect(result.success).toBe(true);
  });
});

describe('RegistryGovernanceActionSchema', () => {
  it('captures deterministic target-state mutations', () => {
    const result = RegistryGovernanceActionSchema.safeParse({
      action_id: 'action-1',
      action_type: 'apply_moderation_action',
      package_id: 'pkg.persona-engine',
      actor_id: 'principal',
      reason_code: 'MKT-006-DISTRIBUTION_BLOCKED',
      target_distribution_status: 'hold',
      target_moderation_state: 'distribution_hold',
      approval_evidence_ref: 'approval-1',
      witness_ref: 'evt-1',
      evidence_refs: ['witness:evt-1'],
      created_at: NOW,
    });

    expect(result.success).toBe(true);
  });
});

describe('RegistryAppealRecordSchema', () => {
  it('models the appeal lifecycle record', () => {
    const result = RegistryAppealRecordSchema.safeParse({
      appeal_id: 'appeal-1',
      package_id: 'pkg.persona-engine',
      release_id: 'release-1',
      maintainer_id: 'maintainer:1',
      submitted_reason: 'Requesting reinstatement',
      submitted_evidence_refs: ['witness:evt-1'],
      status: 'submitted',
      created_at: NOW,
      updated_at: NOW,
    });

    expect(result.success).toBe(true);
  });
});

describe('Registry browse/detail projection schemas', () => {
  it('parses browse and detail wrappers over canonical registry truth', () => {
    const browse = RegistryBrowseResultSchema.safeParse({
      query: {
        query: '',
        trustTiers: [],
        distributionStatuses: [],
        compatibilityStates: [],
        page: 1,
        pageSize: 20,
      },
      items: [],
      totalCount: 0,
      generatedAt: NOW,
    });
    const detail = RegistryPackageDetailSnapshotSchema.safeParse({
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
      governanceTimeline: [],
      appeals: [],
      trustEligibility: null,
      deepLinks: [],
      generatedAt: NOW,
    });

    expect(browse.success).toBe(true);
    expect(detail.success).toBe(true);
  });

  it('parses governance and appeal query result wrappers', () => {
    const governance = RegistryGovernanceTimelineResultSchema.safeParse({
      actions: [],
      generatedAt: NOW,
    });
    const appeals = RegistryAppealQueryResultSchema.safeParse({
      appeals: [],
      generatedAt: NOW,
    });

    expect(governance.success).toBe(true);
    expect(appeals.success).toBe(true);
  });
});
