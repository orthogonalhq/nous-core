import { describe, expect, it } from 'vitest';
import { DocumentRegistryStore } from '../document-registry-store.js';
import { createMemoryDocumentStore } from './test-store.js';

const NOW = '2026-03-10T00:00:00.000Z';

describe('DocumentRegistryStore', () => {
  it('persists and lists canonical registry records', async () => {
    const store = new DocumentRegistryStore(createMemoryDocumentStore());

    await store.savePackage({
      package_id: 'pkg.persona-engine',
      package_type: 'workflow',
      display_name: 'Persona Engine',
      latest_release_id: 'release-1',
      trust_tier: 'verified_maintainer',
      distribution_status: 'active',
      compatibility_state: 'compatible',
      maintainer_ids: ['maintainer:1'],
      evidence_refs: ['witness:evt-1'],
      created_at: NOW,
      updated_at: NOW,
    });
    await store.saveRelease({
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
      evidence_refs: ['witness:evt-1'],
      published_at: NOW,
    });
    await store.saveMaintainer({
      maintainer_id: 'maintainer:1',
      display_name: 'Maintainer 1',
      verification_state: 'verified_individual',
      roles: ['owner'],
      signer_key_ids: ['key-1'],
      reputation_strike_count: 0,
      evidence_refs: ['witness:evt-1'],
      verified_at: NOW,
      updated_at: NOW,
    });
    await store.saveAppeal({
      appeal_id: 'appeal-1',
      package_id: 'pkg.persona-engine',
      maintainer_id: 'maintainer:1',
      submitted_reason: 'Request review',
      submitted_evidence_refs: ['witness:evt-1'],
      status: 'submitted',
      created_at: NOW,
      updated_at: NOW,
    });

    const packageRecord = await store.getPackage('pkg.persona-engine');
    const releaseRecord = await store.getRelease('release-1');
    const maintainer = await store.getMaintainer('maintainer:1');
    const appeal = await store.getAppeal('appeal-1');
    const releases = await store.listReleasesByPackage('pkg.persona-engine');

    expect(packageRecord?.display_name).toBe('Persona Engine');
    expect(releaseRecord?.package_version).toBe('1.0.0');
    expect(maintainer?.verification_state).toBe('verified_individual');
    expect(appeal?.status).toBe('submitted');
    expect(releases).toHaveLength(1);
  });
});
