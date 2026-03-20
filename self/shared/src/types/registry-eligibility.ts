/**
 * Registry eligibility schemas extracted to break the circular dependency:
 * registry.ts -> package-manifest.ts -> package-resolution.ts -> package-lifecycle.ts -> registry.ts
 *
 * package-lifecycle.ts imports only from this file; registry.ts re-exports from here.
 */
import { z } from 'zod';
import { ProjectIdSchema } from './ids.js';

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
