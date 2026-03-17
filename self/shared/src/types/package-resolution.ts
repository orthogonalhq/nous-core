import { z } from 'zod';
import { ProjectIdSchema } from './ids.js';
import { CredentialInstallSetupSchema } from './app-credentials.js';
import {
  PackageLifecycleReasonCodeSchema,
  PackageLifecycleTransitionResultSchema,
} from './package-lifecycle.js';
import { CanonicalRootDirectorySchema } from './package-store.js';

export const PackageResolutionCanonicalTypeSchema = z.enum([
  'skill',
  'app',
  'workflow',
]);
export type PackageResolutionCanonicalType = z.infer<
  typeof PackageResolutionCanonicalTypeSchema
>;

export const PackageDependencySpecSchema = z.object({
  package_id: z.string().min(1),
  package_type: PackageResolutionCanonicalTypeSchema,
  version_range: z.string().min(1),
  required: z.boolean().default(true),
});
export type PackageDependencySpec = z.infer<typeof PackageDependencySpecSchema>;

export const PackageDependencySetSchema = z.object({
  packages: z.array(PackageDependencySpecSchema).default([]),
  tool_requirements: z.array(z.string().min(1)).default([]),
});
export type PackageDependencySet = z.infer<typeof PackageDependencySetSchema>;

export const PackageResolutionReasonCodeSchema = z
  .string()
  .regex(/^(PKG-009|MKT-00[1-9])-[A-Z0-9][A-Z0-9_-]*$/);
export type PackageResolutionReasonCode = z.infer<
  typeof PackageResolutionReasonCodeSchema
>;

export const PACKAGE_RESOLUTION_REASON_CODES = {
  'PKG-009-DEPENDENCY_CYCLE':
    'The dependency graph contains a cycle and cannot be installed.',
  'PKG-009-DEPENDENCY_UNRESOLVED':
    'A dependency could not be resolved from canonical registry metadata.',
  'PKG-009-DEPENDENCY_RANGE_CONFLICT':
    'No single release version satisfies all requested dependency ranges.',
  'PKG-009-STORE_TARGET_INVALID':
    'The selected install target is not a canonical package store.',
  'PKG-009-SYSTEM_BOUNDARY_VIOLATION':
    'The install target crosses the protected .system package boundary.',
  'PKG-009-INSTALL_WRITE_FAILED':
    'Package materialization failed and rollback was required.',
} as const;

export const ResolvedPackageNodeSchema = z.object({
  package_id: z.string().min(1),
  package_type: PackageResolutionCanonicalTypeSchema,
  selected_version: z.string().min(1),
  requested_ranges: z.array(z.string().min(1)).min(1),
  dependency_ids: z.array(z.string().min(1)).default([]),
  install_root: z.lazy(() => CanonicalRootDirectorySchema),
  source_release_id: z.string().min(1).optional(),
  dedupe_parent_ids: z.array(z.string().min(1)).default([]),
});
export type ResolvedPackageNode = z.infer<typeof ResolvedPackageNodeSchema>;

export const PackageResolutionFailureSchema = z.object({
  reason_code: z.lazy(() => PackageLifecycleReasonCodeSchema),
  package_id: z.string().min(1).optional(),
  version_range: z.string().min(1).optional(),
  conflict_package_id: z.string().min(1).optional(),
  detail: z.string().min(1).optional(),
});
export type PackageResolutionFailure = z.infer<
  typeof PackageResolutionFailureSchema
>;

export const PackageResolutionResultSchema = z
  .object({
    root_package_id: z.string().min(1),
    nodes: z.array(ResolvedPackageNodeSchema),
    install_order: z.array(z.string().min(1)),
    deduped_package_ids: z.array(z.string().min(1)).default([]),
    blocked: z.boolean(),
    failure: PackageResolutionFailureSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.blocked && !value.failure) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['failure'],
        message: 'failure is required when resolution is blocked',
      });
    }
  });
export type PackageResolutionResult = z.infer<
  typeof PackageResolutionResultSchema
>;

export const PackageInstallBoundarySchema = z.enum(['user_store', 'system_store']);
export type PackageInstallBoundary = z.infer<typeof PackageInstallBoundarySchema>;

export const CanonicalInstallTargetSchema = z.object({
  package_id: z.string().min(1),
  package_type: PackageResolutionCanonicalTypeSchema,
  root_dir: z.lazy(() => CanonicalRootDirectorySchema),
  absolute_root_path: z.string().min(1),
  package_path: z.string().min(1),
  system_boundary: PackageInstallBoundarySchema.default('user_store'),
});
export type CanonicalInstallTarget = z.infer<typeof CanonicalInstallTargetSchema>;

export const PackageInstallJournalActionSchema = z.enum([
  'prepare',
  'write',
  'rollback',
]);
export type PackageInstallJournalAction = z.infer<
  typeof PackageInstallJournalActionSchema
>;

export const PackageInstallJournalStatusSchema = z.enum([
  'pending',
  'applied',
  'rolled_back',
  'failed',
]);
export type PackageInstallJournalStatus = z.infer<
  typeof PackageInstallJournalStatusSchema
>;

export const PackageInstallJournalEntrySchema = z.object({
  package_id: z.string().min(1),
  selected_version: z.string().min(1),
  target_path: z.string().min(1),
  action: PackageInstallJournalActionSchema,
  status: PackageInstallJournalStatusSchema,
  witness_ref: z.string().min(1).optional(),
  evidence_refs: z.array(z.string().min(1)).default([]),
});
export type PackageInstallJournalEntry = z.infer<
  typeof PackageInstallJournalEntrySchema
>;

export const PackageInstallStatusSchema = z.enum([
  'installed',
  'blocked',
  'rolled_back',
]);
export type PackageInstallStatus = z.infer<typeof PackageInstallStatusSchema>;

export const PackageInstallResultSchema = z.object({
  resolution: PackageResolutionResultSchema,
  writes: z.array(PackageInstallJournalEntrySchema),
  lifecycle_results: z.array(z.lazy(() => PackageLifecycleTransitionResultSchema)),
  status: PackageInstallStatusSchema,
  failure: PackageResolutionFailureSchema.optional(),
});
export type PackageInstallResult = z.infer<typeof PackageInstallResultSchema>;

export const PackageInstallRequestSchema = z
  .object({
    project_id: ProjectIdSchema,
    package_id: z.string().min(1),
    requested_version_range: z.string().min(1).optional(),
    release_id: z.string().min(1).optional(),
    actor_id: z.string().min(1),
    instance_root: z.string().min(1).optional(),
    credential_setup: CredentialInstallSetupSchema.optional(),
    evidence_refs: z.array(z.string().min(1)).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.requested_version_range && value.release_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['release_id'],
        message: 'release_id and requested_version_range are mutually exclusive',
      });
    }
  });
export type PackageInstallRequest = z.infer<typeof PackageInstallRequestSchema>;
