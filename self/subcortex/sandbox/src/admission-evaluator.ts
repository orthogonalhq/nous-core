/**
 * Deterministic runtime admission evaluator for sandbox membrane requests.
 */
import type { SandboxPayload, PackageLifecycleReasonCode } from '@nous/shared';

export interface AdmissionEvaluationResult {
  decision: 'allow' | 'deny' | 'quarantine';
  reasonCode?: PackageLifecycleReasonCode;
}

export const evaluateSandboxAdmission = (
  payload: SandboxPayload,
): AdmissionEvaluationResult => {
  const { admission, origin_class, runtime } = payload;

  if (!admission.signature_valid) {
    return {
      decision: 'quarantine',
      reasonCode: 'PKG-001-UNSIGNED',
    };
  }

  if (!admission.signer_known) {
    return {
      decision: 'quarantine',
      reasonCode: 'PKG-001-REVOKED_SIGNER',
    };
  }

  if (!admission.api_compatible) {
    return {
      decision: 'deny',
      reasonCode: 'PKG-003-API_RANGE_MISMATCH',
    };
  }

  if (!admission.policy_compatible || runtime.control_state === 'hard_stopped') {
    return {
      decision: 'deny',
      reasonCode: 'PKG-003-POLICY_INCOMPATIBLE',
    };
  }

  if (origin_class === 'self_created_local' && admission.is_draft_unsigned) {
    return {
      decision: 'deny',
      reasonCode: 'PKG-006-EXEC_ATTEMPT_IN_DRAFT',
    };
  }

  if (
    admission.is_imported &&
    (!admission.reverification_complete || !admission.reapproval_complete)
  ) {
    return {
      decision: 'deny',
      reasonCode: 'PKG-008-IMPORT_VERIFICATION_PENDING',
    };
  }

  return { decision: 'allow' };
};

