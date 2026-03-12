import { describe, expect, it } from 'vitest';
import { validateRegistryMetadataChain } from '../metadata-validator.js';

const BASE_INPUT = {
  release_id: 'release-1',
  metadata_chain: {
    root_version: 2,
    timestamp_version: 3,
    snapshot_version: 3,
    targets_version: 3,
    trusted_root_key_ids: ['root-a'],
    delegated_key_ids: [],
    metadata_expires_at: '2027-03-12T00:00:00.000Z',
    artifact_digest: 'sha256:abc123',
    metadata_digest: 'sha256:def456',
  },
  expected_artifact_digest: 'sha256:abc123',
  minimum_versions: {
    root_version: 2,
    timestamp_version: 3,
    snapshot_version: 3,
    targets_version: 3,
  },
  trusted_root_key_ids: ['root-a'],
  revoked_key_ids: [],
  checked_at: '2026-03-10T00:00:00.000Z',
};

describe('validateRegistryMetadataChain', () => {
  it('accepts healthy metadata chains', () => {
    const result = validateRegistryMetadataChain(BASE_INPUT);
    expect(result.valid).toBe(true);
    expect(result.reason_codes).toEqual([]);
  });

  it('rejects replayed, expired, and digest-mismatched metadata', () => {
    const result = validateRegistryMetadataChain({
      ...BASE_INPUT,
      metadata_chain: {
        ...BASE_INPUT.metadata_chain,
        timestamp_version: 2,
        metadata_expires_at: '2026-03-09T00:00:00.000Z',
        artifact_digest: 'sha256:wrong',
      },
    });

    expect(result.valid).toBe(false);
    expect(result.reason_codes).toContain('MKT-008-METADATA_REPLAYED');
    expect(result.reason_codes).toContain('MKT-008-METADATA_EXPIRED');
    expect(result.reason_codes).toContain('MKT-008-METADATA_DIGEST_MISMATCH');
  });

  it('rejects downgraded or revoked trust-root state', () => {
    const result = validateRegistryMetadataChain({
      ...BASE_INPUT,
      metadata_chain: {
        ...BASE_INPUT.metadata_chain,
        root_version: 1,
        trusted_root_key_ids: ['root-b'],
      },
      trusted_root_key_ids: ['root-a'],
      revoked_key_ids: ['root-b'],
    });

    expect(result.valid).toBe(false);
    expect(result.reason_codes).toContain('MKT-008-METADATA_DOWNGRADED');
    expect(result.reason_codes).toContain('MKT-008-SIGNER_UNKNOWN');
    expect(result.reason_codes).toContain('MKT-008-SIGNER_REVOKED');
  });
});
