/**
 * Package manifest contracts for Nous package admission.
 */
import { z } from 'zod';
import { PackageTypeSchema, type PackageType } from './enums.js';
import { PackageDependencySetSchema } from './package-resolution.js';

export const ManifestPackageTypeSchema = PackageTypeSchema;
export type ManifestPackageType = z.infer<typeof ManifestPackageTypeSchema>;

export const CanonicalPackageTypeSchema = z.enum(['skill', 'app', 'workflow']);
export type CanonicalPackageType = z.infer<typeof CanonicalPackageTypeSchema>;

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

const BaseNousPackageManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  package_type: PackageTypeSchema,
  origin_class: OriginClassSchema,
  publisher: z.string().min(1).optional(),
  signing_key_id: z.string().min(1).optional(),
  signature: z.string().min(1).optional(),
  source_uri: z.string().min(1).optional(),
  source_hash: z.string().min(1).optional(),
  trust_class: z.string().min(1).optional(),
  trust_policy_profile: z.string().min(1).optional(),
  api_contract_range: z.string().min(1),
  capabilities: z.array(z.string().min(1)).min(1),
  dependencies: z.lazy(() => PackageDependencySetSchema).optional(),
  migration_contract: MigrationContractSchema.optional(),
  display_name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).optional(),
  license: z.string().min(1).optional(),
  homepage: z.string().url().optional(),
  author_principal_id: z.string().min(1).optional(),
  origin_instance_id: z.string().min(1).optional(),
  created_at: z.string().datetime().optional(),
  built_at: z.string().datetime().optional(),
});

export const applySelfCreatedOwnershipValidation = <T extends z.AnyZodObject>(
  schema: T,
) =>
  schema.superRefine((manifest, ctx) => {
    if (manifest.origin_class !== 'self_created_local') {
      return;
    }
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

export const NousPackageManifestSchema =
  applySelfCreatedOwnershipValidation(BaseNousPackageManifestSchema);
export type NousPackageManifest = z.infer<typeof NousPackageManifestSchema>;

export const CanonicalNousPackageManifestObjectSchema =
  BaseNousPackageManifestSchema.omit({
  package_type: true,
}).extend({
  package_type: CanonicalPackageTypeSchema,
});

export const CanonicalNousPackageManifestSchema =
  applySelfCreatedOwnershipValidation(CanonicalNousPackageManifestObjectSchema);
export type CanonicalNousPackageManifest = z.infer<
  typeof CanonicalNousPackageManifestSchema
>;

export const CanonicalGenericPackageManifestSchema = z.union([
  applySelfCreatedOwnershipValidation(
    CanonicalNousPackageManifestObjectSchema.extend({
    package_type: z.literal('skill'),
    }),
  ),
  applySelfCreatedOwnershipValidation(
    CanonicalNousPackageManifestObjectSchema.extend({
    package_type: z.literal('workflow'),
    }),
  ),
]);
export type CanonicalGenericPackageManifest = z.infer<
  typeof CanonicalGenericPackageManifestSchema
>;

export const normalizePackageType = (
  input: PackageType,
): CanonicalPackageType => (input === 'project' ? 'workflow' : input);

export const normalizeNousPackageManifest = (
  manifest: NousPackageManifest,
): CanonicalNousPackageManifest =>
  CanonicalNousPackageManifestSchema.parse({
    ...manifest,
    package_type: normalizePackageType(manifest.package_type),
  });

export const NormalizedNousPackageManifestSchema = NousPackageManifestSchema.transform(
  normalizeNousPackageManifest,
);
export type NormalizedNousPackageManifest = z.infer<
  typeof NormalizedNousPackageManifestSchema
>;

export type ManifestValidationResult =
  | { ok: true; manifest: NousPackageManifest; issues: [] }
  | { ok: false; manifest: null; issues: string[] };

const formatIssue = (issue: z.ZodIssue): string => {
  const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
  return `${path}: ${issue.message}`;
};

export const parseNousPackageManifest = (
  input: unknown,
): NousPackageManifest => NousPackageManifestSchema.parse(input);

export const parseCanonicalNousPackageManifest = (
  input: unknown,
): CanonicalNousPackageManifest =>
  NormalizedNousPackageManifestSchema.parse(input);

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
