/**
 * Package lifecycle event and reason-code contracts.
 */
import { z } from 'zod';
import { OriginClassSchema } from './package-manifest.js';

export const PACKAGE_LIFECYCLE_EVENT_TYPES = [
  'pkg_ingest_received',
  'pkg_provenance_classified',
  'pkg_signature_verified',
  'pkg_signature_rejected',
  'pkg_compatibility_evaluated',
  'pkg_capability_approved',
  'pkg_capability_blocked',
  'pkg_enabled',
  'pkg_enable_blocked',
  'pkg_update_staged',
  'pkg_update_committed',
  'pkg_update_rolled_back',
  'pkg_exported',
  'pkg_import_verified',
  'pkg_import_rejected',
  'pkg_removed',
  'pkg_runtime_admission_decided',
  'pkg_runtime_action_decided',
  'pkg_quarantined',
] as const;
export const PackageLifecycleEventTypeSchema = z.enum(
  PACKAGE_LIFECYCLE_EVENT_TYPES,
);
export type PackageLifecycleEventType = z.infer<
  typeof PackageLifecycleEventTypeSchema
>;

export const PACKAGE_LIFECYCLE_REASON_CODES = {
  'PKG-001-UNSIGNED': 'No signature was provided for package admission.',
  'PKG-001-REVOKED_SIGNER': 'Package signer key is revoked or unknown.',
  'PKG-002-CAPABILITY_NOT_GRANTED':
    'Requested capability is not granted for runtime action.',
  'PKG-002-CAPABILITY_SCOPE_MISMATCH':
    'Capability grant scope does not authorize this runtime action.',
  'PKG-002-CAPABILITY_GRANT_EXPIRED':
    'Capability grant is expired at runtime decision time.',
  'PKG-002-CAPABILITY_REPLAY_DETECTED':
    'Capability grant replay attempt was detected.',
  'PKG-002-CAP_EXPANSION_PENDING':
    'Capability expansion requires explicit re-approval.',
  'PKG-003-API_RANGE_MISMATCH':
    'Manifest api_contract_range does not match runtime version.',
  'PKG-003-POLICY_INCOMPATIBLE':
    'Runtime policy posture is incompatible with requested action.',
  'PKG-003-DIRECT_ACCESS_DENIED':
    'Direct runtime/filesystem/network access outside membrane is denied.',
  'PKG-003-MIGRATION_CONTRACT_REQUIRED':
    'Package requires migration_contract for versioned data schemas.',
  'PKG-004-MIGRATION_FAILED':
    'Migration failed and rollback flow was triggered.',
  'PKG-005-MISSING_WITNESS_REF':
    'Lifecycle transition is missing witness linkage.',
  'PKG-006-EXEC_ATTEMPT_IN_DRAFT':
    'self_created_local package execution attempted in unsigned draft state.',
  'PKG-007-RE_TRUST_REQUIRED':
    'self_created_local package imported across instances requires re-trust.',
  'PKG-008-IMPORT_VERIFICATION_PENDING':
    'Import remains blocked until receiving instance re-verifies package.',
  'API-003-PKG_TYPE_INVALID':
    'Manifest package_type is malformed, ambiguous, or unsupported.',
} as const;

export const PackageLifecycleReasonCodeSchema = z
  .string()
  .regex(/^(PKG-00[1-8]|API-003)-[A-Z0-9][A-Z0-9_-]*$/);
export type PackageLifecycleReasonCode = z.infer<
  typeof PackageLifecycleReasonCodeSchema
>;

export const PackageLifecycleEventBaseSchema = z.object({
  event_type: PackageLifecycleEventTypeSchema,
  package_id: z.string().min(1),
  package_version: z.string().min(1),
  origin_class: OriginClassSchema,
  reason_code: PackageLifecycleReasonCodeSchema.optional(),
  witness_ref: z.string().min(1),
});
export type PackageLifecycleEventBase = z.infer<
  typeof PackageLifecycleEventBaseSchema
>;

export const PACKAGE_LIFECYCLE_REASON_CODE_REQUIRED_EVENT_TYPES = [
  'pkg_signature_rejected',
  'pkg_capability_blocked',
  'pkg_enable_blocked',
  'pkg_update_rolled_back',
  'pkg_import_rejected',
  'pkg_runtime_admission_decided',
  'pkg_runtime_action_decided',
  'pkg_quarantined',
] as const satisfies readonly PackageLifecycleEventType[];

const reasonCodeRequiredTypes = new Set<string>(
  PACKAGE_LIFECYCLE_REASON_CODE_REQUIRED_EVENT_TYPES,
);

export const PackageLifecycleDecisionEventSchema =
  PackageLifecycleEventBaseSchema.superRefine((event, ctx) => {
    if (
      reasonCodeRequiredTypes.has(event.event_type) &&
      !event.reason_code
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason_code'],
        message: `reason_code is required for ${event.event_type}`,
      });
    }
  });
export type PackageLifecycleDecisionEvent = z.infer<
  typeof PackageLifecycleDecisionEventSchema
>;
