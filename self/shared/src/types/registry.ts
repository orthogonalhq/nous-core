import { z } from 'zod';
import { EscalationIdSchema, ProjectIdSchema } from './ids.js';
import { ManifestPackageTypeSchema, OriginClassSchema } from './package-manifest.js';

export const RegistryReasonCodeSchema = z
  .string()
  .regex(/^MKT-00[1-9]-[A-Z0-9][A-Z0-9_-]*$/);
export type RegistryReasonCode = z.infer<typeof RegistryReasonCodeSchema>;

export const RegistryTrustTierSchema = z.enum([
  'nous_first_party',
  'verified_maintainer',
  'community_unverified',
  'unregistered_external',
]);
export type RegistryTrustTier = z.infer<typeof RegistryTrustTierSchema>;

export const RegistryDistributionStatusSchema = z.enum([
  'active',
  'hold',
  'delisted',
  'blocked',
]);
export type RegistryDistributionStatus = z.infer<
  typeof RegistryDistributionStatusSchema
>;

export const RegistryCompatibilityStateSchema = z.enum([
  'compatible',
  'requires_migration',
  'blocked_incompatible',
]);
export type RegistryCompatibilityState = z.infer<
  typeof RegistryCompatibilityStateSchema
>;

export const RegistryModerationStateSchema = z.enum([
  'flagged_for_review',
  'distribution_hold',
  'delisted',
  'global_block',
]);
export type RegistryModerationState = z.infer<
  typeof RegistryModerationStateSchema
>;

export const MaintainerVerificationStateSchema = z.enum([
  'unverified',
  'verified_individual',
  'verified_org',
]);
export type MaintainerVerificationState = z.infer<
  typeof MaintainerVerificationStateSchema
>;

export const MaintainerRoleSchema = z.enum([
  'owner',
  'maintainer',
  'publisher',
]);
export type MaintainerRole = z.infer<typeof MaintainerRoleSchema>;

export const RegistryEvidenceEventTypeSchema = z.enum([
  'registry_release_submitted',
  'registry_release_verified',
  'registry_release_rejected',
  'registry_distribution_status_changed',
  'registry_moderation_action_applied',
  'registry_install_requested',
  'registry_install_authorized',
  'registry_install_blocked',
  'registry_unregistered_attempt_blocked',
  'registry_override_requested',
  'registry_override_approved',
  'registry_override_denied',
  'registry_appeal_submitted',
  'registry_appeal_resolved',
]);
export type RegistryEvidenceEventType = z.infer<
  typeof RegistryEvidenceEventTypeSchema
>;

export const RegistryReleaseCompatibilitySchema = z.object({
  api_contract_range: z.string().min(1),
  capability_manifest: z.array(z.string().min(1)).min(1),
  migration_contract_version: z.string().min(1),
  data_schema_versions: z.array(z.string().min(1)).min(1),
  policy_profile_defaults: z.array(z.string().min(1)).default([]),
});
export type RegistryReleaseCompatibility = z.infer<
  typeof RegistryReleaseCompatibilitySchema
>;

export const SignedMetadataChainSchema = z.object({
  root_version: z.number().int().min(1),
  timestamp_version: z.number().int().min(1),
  snapshot_version: z.number().int().min(1),
  targets_version: z.number().int().min(1),
  trusted_root_key_ids: z.array(z.string().min(1)).min(1),
  delegated_key_ids: z.array(z.string().min(1)).default([]),
  metadata_expires_at: z.string().datetime(),
  artifact_digest: z.string().min(1),
  metadata_digest: z.string().min(1),
});
export type SignedMetadataChain = z.infer<typeof SignedMetadataChainSchema>;

export const RegistryPackageSchema = z.object({
  package_id: z.string().min(1),
  package_type: ManifestPackageTypeSchema,
  display_name: z.string().min(1),
  latest_release_id: z.string().min(1).optional(),
  trust_tier: RegistryTrustTierSchema,
  distribution_status: RegistryDistributionStatusSchema,
  compatibility_state: RegistryCompatibilityStateSchema,
  maintainer_ids: z.array(z.string().min(1)).min(1),
  moderation_state: RegistryModerationStateSchema.optional(),
  policy_profile_ref: z.string().min(1).optional(),
  evidence_refs: z.array(z.string().min(1)).default([]),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type RegistryPackage = z.infer<typeof RegistryPackageSchema>;

export const RegistryReleaseSchema = z.object({
  release_id: z.string().min(1),
  package_id: z.string().min(1),
  package_version: z.string().min(1),
  origin_class: OriginClassSchema,
  signing_key_id: z.string().min(1),
  signature_set_ref: z.string().min(1),
  source_hash: z.string().min(1),
  compatibility: RegistryReleaseCompatibilitySchema,
  metadata_chain: SignedMetadataChainSchema,
  distribution_status: RegistryDistributionStatusSchema,
  compatibility_state: RegistryCompatibilityStateSchema,
  evidence_refs: z.array(z.string().min(1)).default([]),
  published_at: z.string().datetime(),
});
export type RegistryRelease = z.infer<typeof RegistryReleaseSchema>;

export const MaintainerIdentitySchema = z.object({
  maintainer_id: z.string().min(1),
  display_name: z.string().min(1),
  verification_state: MaintainerVerificationStateSchema,
  roles: z.array(MaintainerRoleSchema).min(1),
  signer_key_ids: z.array(z.string().min(1)).default([]),
  reputation_strike_count: z.number().int().min(0).default(0),
  evidence_refs: z.array(z.string().min(1)).default([]),
  verified_at: z.string().datetime().optional(),
  updated_at: z.string().datetime(),
});
export type MaintainerIdentity = z.infer<typeof MaintainerIdentitySchema>;

export const RegistryGovernanceActionTypeSchema = z.enum([
  'apply_moderation_action',
  'change_distribution_status',
  'request_break_glass_override',
  'approve_break_glass_override',
  'deny_break_glass_override',
  'change_trust_root',
  'verify_maintainer',
  'rotate_signing_key',
  'transfer_ownership',
  'resolve_appeal',
]);
export type RegistryGovernanceActionType = z.infer<
  typeof RegistryGovernanceActionTypeSchema
>;

export const RegistryGovernanceActionSchema = z.object({
  action_id: z.string().min(1),
  action_type: RegistryGovernanceActionTypeSchema,
  package_id: z.string().min(1).optional(),
  release_id: z.string().min(1).optional(),
  maintainer_id: z.string().min(1).optional(),
  actor_id: z.string().min(1),
  reason_code: RegistryReasonCodeSchema.or(z.string().min(1)),
  target_distribution_status: RegistryDistributionStatusSchema.optional(),
  target_moderation_state: RegistryModerationStateSchema.optional(),
  target_verification_state: MaintainerVerificationStateSchema.optional(),
  target_signing_key_id: z.string().min(1).optional(),
  approval_evidence_ref: z.string().min(1).optional(),
  witness_ref: z.string().min(1),
  evidence_refs: z.array(z.string().min(1)).min(1),
  created_at: z.string().datetime(),
});
export type RegistryGovernanceAction = z.infer<
  typeof RegistryGovernanceActionSchema
>;

export const RegistryAppealStatusSchema = z.enum([
  'submitted',
  'under_review',
  'resolved_upheld',
  'resolved_reinstated',
]);
export type RegistryAppealStatus = z.infer<typeof RegistryAppealStatusSchema>;

export const RegistryAppealRecordSchema = z.object({
  appeal_id: z.string().min(1),
  package_id: z.string().min(1),
  release_id: z.string().min(1).optional(),
  maintainer_id: z.string().min(1),
  submitted_reason: z.string().min(1),
  submitted_evidence_refs: z.array(z.string().min(1)).min(1),
  status: RegistryAppealStatusSchema,
  resolution_action_id: z.string().min(1).optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type RegistryAppealRecord = z.infer<typeof RegistryAppealRecordSchema>;

export const RegistryMetadataValidationInputSchema = z.object({
  release_id: z.string().min(1).optional(),
  metadata_chain: SignedMetadataChainSchema,
  expected_artifact_digest: z.string().min(1),
  minimum_versions: z.object({
    root_version: z.number().int().min(1).default(1),
    timestamp_version: z.number().int().min(1).default(1),
    snapshot_version: z.number().int().min(1).default(1),
    targets_version: z.number().int().min(1).default(1),
  }),
  trusted_root_key_ids: z.array(z.string().min(1)).min(1),
  revoked_key_ids: z.array(z.string().min(1)).default([]),
  checked_at: z.string().datetime().optional(),
});
export type RegistryMetadataValidationInput = z.infer<
  typeof RegistryMetadataValidationInputSchema
>;

export const RegistryMetadataValidationResultSchema = z.object({
  valid: z.boolean(),
  signer_valid: z.boolean(),
  fresh: z.boolean(),
  reason_codes: z.array(RegistryReasonCodeSchema).default([]),
  checked_at: z.string().datetime(),
});
export type RegistryMetadataValidationResult = z.infer<
  typeof RegistryMetadataValidationResultSchema
>;

export const RegistryEligibilityRequestSchema = z.object({
  project_id: ProjectIdSchema.optional(),
  package_id: z.string().min(1),
  release_id: z.string().min(1),
  principal_override_requested: z.boolean().default(false),
  principal_override_approved: z.boolean().default(false),
  evaluated_at: z.string().datetime().optional(),
});
export type RegistryEligibilityRequest = z.infer<
  typeof RegistryEligibilityRequestSchema
>;

export const RegistryInstallEligibilitySnapshotSchema = z.object({
  project_id: ProjectIdSchema.optional(),
  package_id: z.string().min(1),
  release_id: z.string().min(1),
  package_version: z.string().min(1),
  trust_tier: RegistryTrustTierSchema,
  distribution_status: RegistryDistributionStatusSchema,
  compatibility_state: RegistryCompatibilityStateSchema,
  metadata_valid: z.boolean(),
  signer_valid: z.boolean(),
  requires_principal_override: z.boolean().default(false),
  block_reason_codes: z.array(RegistryReasonCodeSchema).default([]),
  evidence_refs: z.array(z.string().min(1)).default([]),
  evaluated_at: z.string().datetime(),
});
export type RegistryInstallEligibilitySnapshot = z.infer<
  typeof RegistryInstallEligibilitySnapshotSchema
>;

export const RegistryReleaseSubmissionInputSchema = z.object({
  project_id: ProjectIdSchema.optional(),
  package_id: z.string().min(1),
  package_type: ManifestPackageTypeSchema,
  display_name: z.string().min(1),
  package_version: z.string().min(1),
  origin_class: OriginClassSchema,
  registered: z.boolean().default(true),
  signing_key_id: z.string().min(1),
  signature_set_ref: z.string().min(1),
  source_hash: z.string().min(1),
  compatibility: RegistryReleaseCompatibilitySchema,
  metadata_chain: SignedMetadataChainSchema,
  maintainer_ids: z.array(z.string().min(1)).min(1),
  policy_profile_ref: z.string().min(1).optional(),
  published_at: z.string().datetime().optional(),
});
export type RegistryReleaseSubmissionInput = z.infer<
  typeof RegistryReleaseSubmissionInputSchema
>;

export const RegistryReleaseSubmissionResultSchema = z.object({
  accepted: z.boolean(),
  package: RegistryPackageSchema,
  release: RegistryReleaseSchema,
  metadata_validation: RegistryMetadataValidationResultSchema,
  eligibility: RegistryInstallEligibilitySnapshotSchema,
  witness_ref: z.string().min(1),
  evidence_refs: z.array(z.string().min(1)).min(1),
  escalation_id: EscalationIdSchema.optional(),
});
export type RegistryReleaseSubmissionResult = z.infer<
  typeof RegistryReleaseSubmissionResultSchema
>;

export const RegistryGovernanceActionInputSchema = z.object({
  action_type: RegistryGovernanceActionTypeSchema,
  package_id: z.string().min(1).optional(),
  release_id: z.string().min(1).optional(),
  maintainer_id: z.string().min(1).optional(),
  actor_id: z.string().min(1),
  reason_code: RegistryReasonCodeSchema.or(z.string().min(1)),
  target_distribution_status: RegistryDistributionStatusSchema.optional(),
  target_moderation_state: RegistryModerationStateSchema.optional(),
  target_verification_state: MaintainerVerificationStateSchema.optional(),
  target_signing_key_id: z.string().min(1).optional(),
  approval_evidence_ref: z.string().min(1).optional(),
  evidence_refs: z.array(z.string().min(1)).default([]),
});
export type RegistryGovernanceActionInput = z.infer<
  typeof RegistryGovernanceActionInputSchema
>;

export const RegistryAppealSubmissionInputSchema = z.object({
  package_id: z.string().min(1),
  release_id: z.string().min(1).optional(),
  maintainer_id: z.string().min(1),
  submitted_reason: z.string().min(1),
  submitted_evidence_refs: z.array(z.string().min(1)).min(1),
});
export type RegistryAppealSubmissionInput = z.infer<
  typeof RegistryAppealSubmissionInputSchema
>;

export const RegistryAppealResolutionInputSchema = z.object({
  appeal_id: z.string().min(1),
  actor_id: z.string().min(1),
  resolution: z.enum(['uphold', 'reinstate']),
  reason_code: RegistryReasonCodeSchema.or(z.string().min(1)),
  approval_evidence_ref: z.string().min(1).optional(),
  resolution_evidence_refs: z.array(z.string().min(1)).min(1),
});
export type RegistryAppealResolutionInput = z.infer<
  typeof RegistryAppealResolutionInputSchema
>;
