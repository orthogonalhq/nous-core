import { z } from 'zod';
import { CredentialInjectionLocationSchema } from './app-credentials.js';
import {
  AppConfigFieldSchema,
  AppPermissionsSchema,
  InstallValidationEntrySchema,
  InstallValidationResultSchema,
} from './app-manifest.js';
import { ProjectIdSchema } from './ids.js';
import { PackageInstallResultSchema } from './package-resolution.js';

export const AppInstallStageSchema = z.enum([
  'permission_review',
  'configuration',
  'validation_activation',
]);
export type AppInstallStage = z.infer<typeof AppInstallStageSchema>;

export const AppInstallConfigFieldDescriptorSchema = AppConfigFieldSchema.extend({
  key: z.string().min(1),
  secret: z.boolean().default(false),
});
export type AppInstallConfigFieldDescriptor = z.infer<
  typeof AppInstallConfigFieldDescriptorSchema
>;

export const AppInstallConfigGroupSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  fields: z.array(AppInstallConfigFieldDescriptorSchema).min(1),
});
export type AppInstallConfigGroup = z.infer<typeof AppInstallConfigGroupSchema>;

export const AppInstallPreparationSchema = z.object({
  package_id: z.string().min(1),
  release_id: z.string().min(1),
  package_version: z.string().min(1),
  app_id: z.string().min(1),
  display_name: z.string().min(1),
  description: z.string().min(1).optional(),
  permissions: AppPermissionsSchema,
  config_groups: z.array(AppInstallConfigGroupSchema).default([]),
  stages: z.array(AppInstallStageSchema).default([
    'permission_review',
    'configuration',
    'validation_activation',
  ]),
  has_install_hook: z.boolean().default(false),
});
export type AppInstallPreparation = z.infer<typeof AppInstallPreparationSchema>;

export const AppInstallPrepareRequestSchema = z.object({
  project_id: ProjectIdSchema,
  package_id: z.string().min(1),
  release_id: z.string().min(1).optional(),
});
export type AppInstallPrepareRequest = z.infer<
  typeof AppInstallPrepareRequestSchema
>;

export const AppSecretConfigStateSchema = z.object({
  key: z.string().min(1),
  configured: z.boolean().default(true),
  credential_ref: z.string().min(1).optional(),
  source: z.enum(['secret_field', 'oauth']).default('secret_field'),
  provider: z.string().min(1).optional(),
});
export type AppSecretConfigState = z.infer<typeof AppSecretConfigStateSchema>;

export const AppInstallOAuthRequestSchema = z.object({
  key: z.string().min(1),
  provider: z.string().min(1),
  scopes: z.array(z.string().min(1)).default([]),
  callbackPath: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).default({}),
  target_host: z.string().min(1).default('install-config'),
  injection_location: CredentialInjectionLocationSchema.default('body'),
  injection_key: z.string().min(1).optional(),
});
export type AppInstallOAuthRequest = z.infer<
  typeof AppInstallOAuthRequestSchema
>;

export const AppInstallRequestSchema = z.object({
  project_id: ProjectIdSchema,
  package_id: z.string().min(1),
  release_id: z.string().min(1).optional(),
  actor_id: z.string().min(1),
  permissions_approved: z.boolean(),
  config: z.record(z.unknown()).default({}),
  secrets: z.record(z.string().min(1)).default({}),
  oauth: z.array(AppInstallOAuthRequestSchema).default([]),
  evidence_refs: z.array(z.string().min(1)).default([]),
});
export type AppInstallRequest = z.infer<typeof AppInstallRequestSchema>;

export const AppInstallHookInputSchema = z.object({
  app_id: z.string().min(1),
  package_id: z.string().min(1),
  project_id: ProjectIdSchema.optional(),
  config: z.record(z.unknown()).default({}),
  secret_config: z.record(AppSecretConfigStateSchema).default({}),
});
export type AppInstallHookInput = z.infer<typeof AppInstallHookInputSchema>;

export const AppInstallHookResultSchema = z.object({
  status: z.enum(['success', 'partial', 'failed']),
  results: z.array(InstallValidationEntrySchema).default([]),
  metadata: z.record(z.unknown()).default({}),
});
export type AppInstallHookResult = z.infer<typeof AppInstallHookResultSchema>;

export const AppInstallActivationFailureSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  retryable: z.boolean().default(false),
});
export type AppInstallActivationFailure = z.infer<
  typeof AppInstallActivationFailureSchema
>;

export const AppInstallResultSchema = z.object({
  status: z.enum(['success', 'partial', 'failed']),
  phase: z.enum([
    'permission_review',
    'configuration',
    'validation',
    'activation',
    'completed',
  ]),
  preparation: AppInstallPreparationSchema,
  validation: InstallValidationResultSchema,
  package_install: PackageInstallResultSchema.optional(),
  runtime_session_id: z.string().min(1).optional(),
  app_config_version: z.string().min(1).optional(),
  stored_secrets: z.array(AppSecretConfigStateSchema).default([]),
  activation_failure: AppInstallActivationFailureSchema.optional(),
  witness_refs: z.array(z.string().min(1)).default([]),
  rollback_applied: z.boolean().default(false),
  recoverable: z.boolean().default(true),
  metadata: z.record(z.unknown()).default({}),
});
export type AppInstallResult = z.infer<typeof AppInstallResultSchema>;

export const AppProjectConfigDocumentSchema = z.object({
  project_id: ProjectIdSchema,
  package_id: z.string().min(1),
  release_id: z.string().min(1),
  app_id: z.string().min(1),
  config_version: z.string().min(1),
  values: z.record(z.unknown()).default({}),
  secret_config: z.record(AppSecretConfigStateSchema).default({}),
  updated_at: z.string().datetime(),
});
export type AppProjectConfigDocument = z.infer<
  typeof AppProjectConfigDocumentSchema
>;

