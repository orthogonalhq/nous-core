import type {
  PackageLifecycleReasonCode,
  PackageLifecycleSourceState,
  PackageLifecycleTransition,
  PackageLifecycleTransitionRequest,
} from '@nous/shared';
import { isTransitionAllowed } from './transition-matrix.js';

export interface LifecycleValidationResult {
  ok: boolean;
  reasonCode?: PackageLifecycleReasonCode;
}

export const validateTransitionRoute = (
  fromState: PackageLifecycleSourceState,
  transition: PackageLifecycleTransition,
): LifecycleValidationResult => {
  if (!isTransitionAllowed(fromState, transition)) {
    return { ok: false, reasonCode: 'PKG-005-INVALID_TRANSITION' };
  }
  return { ok: true };
};

export const evaluateTransitionGuards = (
  request: PackageLifecycleTransitionRequest,
): PackageLifecycleReasonCode | null => {
  const { admission, compatibility, capability, registry_eligibility } = request;

  if (admission) {
    if (!admission.signature_valid) {
      return 'PKG-001-UNSIGNED';
    }
    if (!admission.signer_known) {
      return 'PKG-001-REVOKED_SIGNER';
    }
    if (!admission.policy_compatible) {
      return 'PKG-003-POLICY_INCOMPATIBLE';
    }
    if (request.origin_class === 'self_created_local' && admission.is_draft_unsigned) {
      return 'PKG-006-EXEC_ATTEMPT_IN_DRAFT';
    }
    if (
      admission.is_imported &&
      (!admission.reverification_complete || !admission.reapproval_complete)
    ) {
      return 'PKG-008-IMPORT_VERIFICATION_PENDING';
    }
  }

  if (compatibility && !compatibility.api_compatible) {
    return 'PKG-003-API_RANGE_MISMATCH';
  }

  if (
    capability &&
    capability.expansion_requested &&
    !capability.reapproval_granted
  ) {
    return 'PKG-002-CAP_EXPANSION_PENDING';
  }

  if (registry_eligibility) {
    if (registry_eligibility.requires_principal_override) {
      return 'MKT-004-PRINCIPAL_OVERRIDE_REQUIRED';
    }

    if (registry_eligibility.block_reason_codes.length > 0) {
      return registry_eligibility.block_reason_codes[0] as PackageLifecycleReasonCode;
    }

    if (!registry_eligibility.metadata_valid) {
      return 'MKT-008-METADATA_DIGEST_MISMATCH';
    }

    if (registry_eligibility.compatibility_state === 'blocked_incompatible') {
      return 'MKT-007-COMPATIBILITY_BLOCKED';
    }
  }

  return null;
};

export const evaluateUpdateCommitGuards = (
  request: PackageLifecycleTransitionRequest,
): PackageLifecycleReasonCode | null => {
  const checks = request.update_checks;
  if (!checks) {
    return null;
  }
  if (!checks.migration_passed || !checks.health_passed || !checks.invariants_passed) {
    return 'PKG-004-UPDATE_STAGE_CHECK_FAILED';
  }
  return null;
};

export const evaluateRollbackGuards = (
  request: PackageLifecycleTransitionRequest,
): PackageLifecycleReasonCode | null => {
  if (request.rollback && !request.rollback.trust_checks_passed) {
    return 'PKG-004-ROLLBACK_TRUST_CHECK_FAILED';
  }
  return null;
};

export const evaluateRemoveGuards = (
  request: PackageLifecycleTransitionRequest,
): PackageLifecycleReasonCode | null => {
  if (request.target_transition !== 'remove') {
    return null;
  }
  if (!request.retention_decision) {
    return 'PKG-005-REMOVE_RETENTION_DECISION_REQUIRED';
  }
  return null;
};
