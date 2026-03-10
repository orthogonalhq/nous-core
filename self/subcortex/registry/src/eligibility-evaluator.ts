import type {
  RegistryCompatibilityState,
  RegistryDistributionStatus,
  RegistryEligibilityRequest,
  RegistryInstallEligibilitySnapshot,
  RegistryMetadataValidationResult,
  RegistryPackage,
  RegistryReasonCode,
  RegistryRelease,
} from '@nous/shared';
import { RegistryInstallEligibilitySnapshotSchema } from '@nous/shared';

export interface RegistryEligibilityEvaluationInput {
  request: RegistryEligibilityRequest;
  packageRecord: RegistryPackage;
  releaseRecord: RegistryRelease;
  metadataValidation: RegistryMetadataValidationResult;
  now?: () => string;
}

function resolveDistributionStatus(
  packageRecord: RegistryPackage,
  releaseRecord: RegistryRelease,
): RegistryDistributionStatus {
  const statuses = [packageRecord.distribution_status, releaseRecord.distribution_status];
  if (statuses.includes('blocked')) {
    return 'blocked';
  }
  if (statuses.includes('delisted')) {
    return 'delisted';
  }
  if (statuses.includes('hold')) {
    return 'hold';
  }
  return 'active';
}

function resolveCompatibilityState(
  packageRecord: RegistryPackage,
  releaseRecord: RegistryRelease,
): RegistryCompatibilityState {
  const states = [packageRecord.compatibility_state, releaseRecord.compatibility_state];
  if (states.includes('blocked_incompatible')) {
    return 'blocked_incompatible';
  }
  if (states.includes('requires_migration')) {
    return 'requires_migration';
  }
  return 'compatible';
}

export function evaluateRegistryEligibility(
  input: RegistryEligibilityEvaluationInput,
): RegistryInstallEligibilitySnapshot {
  const checkedAt = input.request.evaluated_at ?? input.now?.() ?? new Date().toISOString();
  const distributionStatus = resolveDistributionStatus(
    input.packageRecord,
    input.releaseRecord,
  );
  const compatibilityState = resolveCompatibilityState(
    input.packageRecord,
    input.releaseRecord,
  );
  const blockReasonCodes: RegistryReasonCode[] = [];

  if (input.packageRecord.trust_tier === 'unregistered_external') {
    blockReasonCodes.push('MKT-002-UNREGISTERED_EXTERNAL');
  }

  if (
    distributionStatus !== 'active' ||
    input.packageRecord.moderation_state === 'distribution_hold' ||
    input.packageRecord.moderation_state === 'delisted' ||
    input.packageRecord.moderation_state === 'global_block'
  ) {
    blockReasonCodes.push('MKT-006-DISTRIBUTION_BLOCKED');
  }

  if (compatibilityState === 'blocked_incompatible') {
    blockReasonCodes.push('MKT-007-COMPATIBILITY_BLOCKED');
  }

  if (
    input.request.principal_override_requested &&
    !input.request.principal_override_approved
  ) {
    blockReasonCodes.push('MKT-004-PRINCIPAL_OVERRIDE_REQUIRED');
  }

  blockReasonCodes.push(...input.metadataValidation.reason_codes);

  return RegistryInstallEligibilitySnapshotSchema.parse({
    project_id: input.request.project_id,
    package_id: input.packageRecord.package_id,
    release_id: input.releaseRecord.release_id,
    package_version: input.releaseRecord.package_version,
    trust_tier: input.packageRecord.trust_tier,
    distribution_status: distributionStatus,
    compatibility_state: compatibilityState,
    metadata_valid: input.metadataValidation.valid,
    signer_valid: input.metadataValidation.signer_valid,
    requires_principal_override:
      input.request.principal_override_requested &&
      !input.request.principal_override_approved,
    block_reason_codes: [...new Set(blockReasonCodes)],
    evidence_refs: [
      ...input.packageRecord.evidence_refs,
      ...input.releaseRecord.evidence_refs,
    ],
    evaluated_at: checkedAt,
  });
}
