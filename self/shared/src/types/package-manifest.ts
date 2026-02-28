/**
 * Package manifest contracts for Nous package admission.
 *
 * Phase 7.2: Canonical schema for package.nous.json-like manifests.
 */
import { z } from 'zod';

export const PackageTypeSchema = z.enum(['skill', 'project']);
export type PackageType = z.infer<typeof PackageTypeSchema>;
export const ManifestPackageTypeSchema = PackageTypeSchema;
export type ManifestPackageType = PackageType;

export const OriginClassSchema = z.enum([
  'nous_first_party',
  'third_party_external',
  'self_created_local',
]);
export type OriginClass = z.infer<typeof OriginClassSchema>;

export const MigrationContractSchema = z.object({
  version: z.string().min(1),
  data_schema_versions: z.array(z.string().min(1)).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type MigrationContract = z.infer<typeof MigrationContractSchema>;

export const NousPackageManifestSchema = z
  .object({
    // Identity
    id: z.string().min(1),
    name: z.string().min(1),
    version: z.string().min(1),
    package_type: PackageTypeSchema,
    origin_class: OriginClassSchema,

    // Provenance
    publisher: z.string().min(1).optional(),
    signing_key_id: z.string().min(1).optional(),
    signature: z.string().min(1).optional(),
    source_uri: z.string().min(1).optional(),
    source_hash: z.string().min(1).optional(),

    // Trust
    trust_class: z.string().min(1).optional(),
    trust_policy_profile: z.string().min(1).optional(),

    // API compatibility
    api_contract_range: z.string().min(1),

    // Capability declaration
    capabilities: z.array(z.string().min(1)).min(1),

    // Migration
    migration_contract: MigrationContractSchema.optional(),

    // Metadata
    display_name: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    tags: z.array(z.string().min(1)).optional(),
    license: z.string().min(1).optional(),
    homepage: z.string().url().optional(),

    // self_created_local requirements
    author_principal_id: z.string().min(1).optional(),
    origin_instance_id: z.string().min(1).optional(),
    created_at: z.string().datetime().optional(),
    built_at: z.string().datetime().optional(),
  })
  .superRefine((manifest, ctx) => {
    if (manifest.origin_class !== 'self_created_local') return;

    if (!manifest.author_principal_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['author_principal_id'],
        message:
          'author_principal_id is required when origin_class is self_created_local',
      });
    }

    if (!manifest.origin_instance_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['origin_instance_id'],
        message:
          'origin_instance_id is required when origin_class is self_created_local',
      });
    }
  });
export type NousPackageManifest = z.infer<typeof NousPackageManifestSchema>;

export type ManifestValidationResult =
  | {
      ok: true;
      manifest: NousPackageManifest;
      issues: [];
    }
  | {
      ok: false;
      manifest: null;
      issues: string[];
    };

const formatIssue = (issue: z.ZodIssue): string => {
  const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
  return `${path}: ${issue.message}`;
};

export const parseNousPackageManifest = (
  input: unknown,
): NousPackageManifest => NousPackageManifestSchema.parse(input);

export const validateNousPackageManifest = (
  input: unknown,
): ManifestValidationResult => {
  const result = NousPackageManifestSchema.safeParse(input);
  if (result.success) {
    return {
      ok: true,
      manifest: result.data,
      issues: [],
    };
  }

  return {
    ok: false,
    manifest: null,
    issues: result.error.issues.map(formatIssue),
  };
};
