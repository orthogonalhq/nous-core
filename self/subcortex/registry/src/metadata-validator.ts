import type {
  RegistryMetadataValidationInput,
  RegistryMetadataValidationResult,
  RegistryReasonCode,
} from '@nous/shared';
import {
  RegistryMetadataValidationInputSchema,
  RegistryMetadataValidationResultSchema,
} from '@nous/shared';

export interface RegistryMetadataValidatorOptions {
  now?: () => string;
}

export function validateRegistryMetadataChain(
  input: RegistryMetadataValidationInput,
  options: RegistryMetadataValidatorOptions = {},
): RegistryMetadataValidationResult {
  const parsed = RegistryMetadataValidationInputSchema.parse(input);
  const checkedAt = parsed.checked_at ?? options.now?.() ?? new Date().toISOString();
  const checkedDate = new Date(checkedAt);
  const reasonCodes: RegistryReasonCode[] = [];

  if (new Date(parsed.metadata_chain.metadata_expires_at) <= checkedDate) {
    reasonCodes.push('MKT-008-METADATA_EXPIRED');
  }

  if (parsed.metadata_chain.root_version < parsed.minimum_versions.root_version) {
    reasonCodes.push('MKT-008-METADATA_DOWNGRADED');
  }

  if (
    parsed.metadata_chain.timestamp_version < parsed.minimum_versions.timestamp_version ||
    parsed.metadata_chain.snapshot_version < parsed.minimum_versions.snapshot_version ||
    parsed.metadata_chain.targets_version < parsed.minimum_versions.targets_version
  ) {
    reasonCodes.push('MKT-008-METADATA_REPLAYED');
  }

  if (parsed.metadata_chain.artifact_digest !== parsed.expected_artifact_digest) {
    reasonCodes.push('MKT-008-METADATA_DIGEST_MISMATCH');
  }

  const trustedRootSet = new Set(parsed.trusted_root_key_ids);
  const releaseRootKeys = parsed.metadata_chain.trusted_root_key_ids;
  if (!releaseRootKeys.some((keyId: string) => trustedRootSet.has(keyId))) {
    reasonCodes.push('MKT-008-SIGNER_UNKNOWN');
  }

  const revokedSet = new Set(parsed.revoked_key_ids);
  if (releaseRootKeys.some((keyId: string) => revokedSet.has(keyId))) {
    reasonCodes.push('MKT-008-SIGNER_REVOKED');
  }

  return RegistryMetadataValidationResultSchema.parse({
    valid: reasonCodes.length === 0,
    signer_valid:
      !reasonCodes.includes('MKT-008-SIGNER_UNKNOWN') &&
      !reasonCodes.includes('MKT-008-SIGNER_REVOKED'),
    fresh:
      !reasonCodes.includes('MKT-008-METADATA_EXPIRED') &&
      !reasonCodes.includes('MKT-008-METADATA_REPLAYED') &&
      !reasonCodes.includes('MKT-008-METADATA_DOWNGRADED'),
    reason_codes: [...new Set(reasonCodes)],
    checked_at: checkedAt,
  });
}
