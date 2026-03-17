/**
 * Package lifecycle event and reason-code contracts.
 */
import { z } from 'zod';
import { OriginClassSchema } from './package-manifest.js';
import { RegistryInstallEligibilitySnapshotSchema } from './registry.js';

export const PACKAGE_LIFECYCLE_EVENT_TYPES = [
  'pkg_ingest_received',
  'pkg_provenance_classified',
  'pkg_signature_verified',
  'pkg_signature_rejected',
  'pkg_compatibility_evaluated',
  'pkg_capability_approved',
  'pkg_capability_blocked',
  'pkg_enabled',
  'pkg_running',
  'pkg_disabled',
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
  'PKG-004-UPDATE_STAGE_CHECK_FAILED':
    'Update stage checks failed before commit and rollback was required.',
  'PKG-004-ROLLBACK_TRUST_CHECK_FAILED':
    'Rollback trust checks failed; package was disabled.',
  'PKG-005-MISSING_WITNESS_REF':
    'Lifecycle transition is missing witness linkage.',
  'PKG-005-REMOVE_RETENTION_DECISION_REQUIRED':
    'Remove transition requires explicit export/delete retention decision.',
  'PKG-005-INVALID_TRANSITION':
    'Requested lifecycle transition is invalid for current state.',
  'PKG-006-EXEC_ATTEMPT_IN_DRAFT':
    'self_created_local package execution attempted in unsigned draft state.',
  'PKG-007-RE_TRUST_REQUIRED':
    'self_created_local package imported across instances requires re-trust.',
  'PKG-008-IMPORT_VERIFICATION_PENDING':
    'Import remains blocked until receiving instance re-verifies package.',
  'PKG-009-DEPENDENCY_CYCLE':
    'Dependency resolution detected a cycle and blocked installation.',
  'PKG-009-DEPENDENCY_UNRESOLVED':
    'Dependency resolution could not find a required package or release.',
  'PKG-009-DEPENDENCY_RANGE_CONFLICT':
    'Dependency resolution could not satisfy all requested version ranges.',
  'PKG-009-STORE_TARGET_INVALID':
    'Resolved package target is not a canonical install store.',
  'PKG-009-SYSTEM_BOUNDARY_VIOLATION':
    'Resolved package target crosses the protected .system boundary.',
  'PKG-009-INSTALL_WRITE_FAILED':
    'Package installation write failed and rollback was required.',
  'PKG-010-SPAWN_FAILED':
    'Runtime subprocess spawn failed before activation completed.',
  'PKG-010-HANDSHAKE_TIMEOUT':
    'Runtime activation handshake timed out before readiness was proven.',
  'PKG-010-HANDSHAKE_INVALID':
    'Runtime activation handshake payload was malformed or invalid.',
  'PKG-010-TOOL_NAMESPACE_COLLISION':
    'Runtime tool registration collided with an existing tool namespace.',
  'PKG-010-HEARTBEAT_STALE':
    'Runtime heartbeat freshness could no longer be proven.',
  'PKG-010-HEALTH_PAYLOAD_INVALID':
    'Runtime health payload was malformed or failed validation.',
  'MKT-002-UNREGISTERED_EXTERNAL':
    'Registry eligibility blocked an unregistered external package.',
  'MKT-004-PRINCIPAL_OVERRIDE_REQUIRED':
    'Registry eligibility requires explicit Principal override approval.',
  'MKT-006-DISTRIBUTION_BLOCKED':
    'Registry distribution or moderation posture blocks installation.',
  'MKT-007-COMPATIBILITY_BLOCKED':
    'Registry compatibility evaluation blocks installation or update.',
  'MKT-008-METADATA_STALE':
    'Registry metadata is stale and no longer trusted.',
  'MKT-008-METADATA_REPLAYED':
    'Registry metadata replay was detected.',
  'MKT-008-METADATA_DOWNGRADED':
    'Registry metadata version downgrade was detected.',
  'MKT-008-METADATA_EXPIRED':
    'Registry metadata expired before validation completed.',
  'MKT-008-METADATA_DIGEST_MISMATCH':
    'Registry metadata or artifact digest mismatch was detected.',
  'MKT-008-SIGNER_REVOKED':
    'Registry signer key is revoked.',
  'MKT-008-SIGNER_UNKNOWN':
    'Registry signer key is not trusted.',
  'API-003-PKG_TYPE_INVALID':
    'Manifest package_type is malformed, ambiguous, or unsupported.',
} as const;

export const PackageLifecycleReasonCodeSchema = z
  .string()
  .regex(/^(PKG-0(0[1-9]|1[0-9])|MKT-00[1-9]|API-003)-[A-Z0-9][A-Z0-9_-]*$/);
export type PackageLifecycleReasonCode = z.infer<
  typeof PackageLifecycleReasonCodeSchema
>;

export const PackageLifecycleEventBaseSchema = z.object({
  event_type: PackageLifecycleEventTypeSchema,
  package_id: z.string().min(1),
  package_version: z.string().min(1),
  origin_class: z.lazy(() => OriginClassSchema),
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

export const PACKAGE_LIFECYCLE_STATES = [
  'ingested',
  'installed',
  'enabled',
  'running',
  'update_staged',
  'update_committed',
  'rolled_back',
  'quarantined',
  'import_verified',
  'removed',
  'disabled',
] as const;
export const PackageLifecycleStateSchema = z.enum(PACKAGE_LIFECYCLE_STATES);
export type PackageLifecycleState = z.infer<typeof PackageLifecycleStateSchema>;

export const PACKAGE_LIFECYCLE_TRANSITIONS = [
  'ingest',
  'install',
  'enable',
  'run',
  'stage_update',
  'commit_update',
  'rollback_update',
  'export',
  'import',
  'remove',
  'disable',
] as const;
export const PackageLifecycleTransitionSchema = z.enum(
  PACKAGE_LIFECYCLE_TRANSITIONS,
);
export type PackageLifecycleTransition = z.infer<
  typeof PackageLifecycleTransitionSchema
>;

export const PackageLifecycleSourceStateSchema = z.union([
  PackageLifecycleStateSchema,
  z.literal('none'),
]);
export type PackageLifecycleSourceState = z.infer<
  typeof PackageLifecycleSourceStateSchema
>;

export const PackageLifecycleRetentionDecisionSchema = z.enum([
  'export_then_remove',
  'delete_confirmed',
]);
export type PackageLifecycleRetentionDecision = z.infer<
  typeof PackageLifecycleRetentionDecisionSchema
>;

export const PackageLifecycleAdmissionInputSchema = z.object({
  signature_valid: z.boolean(),
  signer_known: z.boolean(),
  policy_compatible: z.boolean().default(true),
  is_draft_unsigned: z.boolean().default(false),
  is_imported: z.boolean().default(false),
  reverification_complete: z.boolean().default(true),
  reapproval_complete: z.boolean().default(true),
});
export type PackageLifecycleAdmissionInput = z.infer<
  typeof PackageLifecycleAdmissionInputSchema
>;

export const PackageLifecycleCompatibilityInputSchema = z.object({
  api_compatible: z.boolean().default(true),
});
export type PackageLifecycleCompatibilityInput = z.infer<
  typeof PackageLifecycleCompatibilityInputSchema
>;

export const PackageLifecycleCapabilityInputSchema = z.object({
  expansion_requested: z.boolean().default(false),
  reapproval_granted: z.boolean().default(false),
});
export type PackageLifecycleCapabilityInput = z.infer<
  typeof PackageLifecycleCapabilityInputSchema
>;

export const PackageLifecycleUpdateChecksSchema = z.object({
  migration_passed: z.boolean().default(true),
  health_passed: z.boolean().default(true),
  invariants_passed: z.boolean().default(true),
});
export type PackageLifecycleUpdateChecks = z.infer<
  typeof PackageLifecycleUpdateChecksSchema
>;

export const PackageLifecycleRollbackInputSchema = z.object({
  trust_checks_passed: z.boolean().default(true),
});
export type PackageLifecycleRollbackInput = z.infer<
  typeof PackageLifecycleRollbackInputSchema
>;

export const PackageLifecycleTransitionRequestSchema = z.object({
  project_id: z.string().min(1),
  package_id: z.string().min(1),
  package_version: z.string().min(1),
  origin_class: z.lazy(() => OriginClassSchema),
  target_transition: PackageLifecycleTransitionSchema,
  target_version: z.string().min(1).optional(),
  actor_id: z.string().min(1),
  confirmation_proof_ref: z.string().min(1).optional(),
  retention_decision: PackageLifecycleRetentionDecisionSchema.optional(),
  admission: PackageLifecycleAdmissionInputSchema.optional(),
  compatibility: PackageLifecycleCompatibilityInputSchema.optional(),
  capability: PackageLifecycleCapabilityInputSchema.optional(),
  registry_eligibility: z
    .lazy(() => RegistryInstallEligibilitySnapshotSchema)
    .optional(),
  update_checks: PackageLifecycleUpdateChecksSchema.optional(),
  rollback: PackageLifecycleRollbackInputSchema.optional(),
  checkpoint_ref: z.string().min(1).optional(),
});
export type PackageLifecycleTransitionRequest = z.infer<
  typeof PackageLifecycleTransitionRequestSchema
>;

export const PackageLifecycleStateRecordSchema = z.object({
  project_id: z.string().min(1),
  package_id: z.string().min(1),
  package_version: z.string().min(1),
  origin_class: z.lazy(() => OriginClassSchema),
  current_state: PackageLifecycleStateSchema,
  previous_safe_version: z.string().min(1).optional(),
  trust_scope: z.enum([
    'local_instance',
    'cross_instance_approved',
    'quarantined',
  ]),
  last_reason_code: PackageLifecycleReasonCodeSchema.optional(),
  last_witness_ref: z.string().min(1),
  version: z.number().int().min(1),
  updated_at: z.string().datetime(),
});
export type PackageLifecycleStateRecord = z.infer<
  typeof PackageLifecycleStateRecordSchema
>;

export const PackageUpdateStageSnapshotSchema = z.object({
  project_id: z.string().min(1),
  package_id: z.string().min(1),
  previous_safe_version: z.string().min(1),
  candidate_version: z.string().min(1),
  migration_contract_version: z.string().min(1).optional(),
  checkpoint_ref: z.string().min(1),
  staged_at: z.string().datetime(),
});
export type PackageUpdateStageSnapshot = z.infer<
  typeof PackageUpdateStageSnapshotSchema
>;

export const PackageLifecycleTransitionDecisionSchema = z.enum([
  'allowed',
  'blocked',
  'rolled_back',
  'disabled',
]);
export type PackageLifecycleTransitionDecision = z.infer<
  typeof PackageLifecycleTransitionDecisionSchema
>;

export const PackageLifecycleTransitionResultSchema = z
  .object({
    decision: PackageLifecycleTransitionDecisionSchema,
    transition: PackageLifecycleTransitionSchema,
    from_state: PackageLifecycleSourceStateSchema,
    to_state: PackageLifecycleStateSchema,
    reason_code: PackageLifecycleReasonCodeSchema.optional(),
    witness_ref: z.string().min(1),
    evidence_refs: z.array(z.string().min(1)).min(1),
    state_record: PackageLifecycleStateRecordSchema.optional(),
    update_snapshot: PackageUpdateStageSnapshotSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.decision !== 'allowed' && !value.reason_code) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason_code'],
        message:
          'reason_code is required when decision is blocked/rolled_back/disabled',
      });
    }
  });
export type PackageLifecycleTransitionResult = z.infer<
  typeof PackageLifecycleTransitionResultSchema
>;
