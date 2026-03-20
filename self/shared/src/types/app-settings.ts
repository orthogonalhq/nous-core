import { z } from 'zod';
import {
  AppInstallActivationFailureSchema,
  AppInstallConfigFieldDescriptorSchema,
  AppInstallConfigGroupSchema,
  AppSecretConfigStateSchema,
} from './app-install.js';
import {
  AppHealthStatusSchema,
  AppPanelSafeConfigSnapshotSchema,
} from './app-runtime.js';
import { InstallValidationResultSchema } from './app-manifest.js';
import { ProjectIdSchema } from './ids.js';

export const AppSettingsRuntimeStatusSchema = z.enum([
  'active',
  'inactive',
  'failed',
]);
export type AppSettingsRuntimeStatus = z.infer<
  typeof AppSettingsRuntimeStatusSchema
>;

export const AppSettingsRuntimeSummarySchema = z.object({
  session_id: z.string().min(1).optional(),
  status: AppSettingsRuntimeStatusSchema,
  health_status: AppHealthStatusSchema.optional(),
  config_version: z.string().min(1),
});
export type AppSettingsRuntimeSummary = z.infer<
  typeof AppSettingsRuntimeSummarySchema
>;

export const AppSettingsValueSourceSchema = z.enum([
  'manifest_default',
  'project_config',
  'secret_state',
]);
export type AppSettingsValueSource = z.infer<
  typeof AppSettingsValueSourceSchema
>;

export const AppSettingsFieldStateSchema =
  AppInstallConfigFieldDescriptorSchema.extend({
    value: z.unknown().optional(),
    value_source: AppSettingsValueSourceSchema.optional(),
    secret_state: AppSecretConfigStateSchema.optional(),
  });
export type AppSettingsFieldState = z.infer<typeof AppSettingsFieldStateSchema>;

export const AppSettingsConfigGroupSchema = AppInstallConfigGroupSchema.extend({
  fields: z.array(AppSettingsFieldStateSchema).min(1),
});
export type AppSettingsConfigGroup = z.infer<
  typeof AppSettingsConfigGroupSchema
>;

export const AppSettingsPreparationSchema = z.object({
  project_id: ProjectIdSchema,
  package_id: z.string().min(1),
  release_id: z.string().min(1),
  package_version: z.string().min(1),
  app_id: z.string().min(1),
  display_name: z.string().min(1),
  description: z.string().min(1).optional(),
  config_version: z.string().min(1),
  runtime: AppSettingsRuntimeSummarySchema,
  config_groups: z.array(AppSettingsConfigGroupSchema).default([]),
  panel_config_snapshot: AppPanelSafeConfigSnapshotSchema.default({}),
});
export type AppSettingsPreparation = z.infer<
  typeof AppSettingsPreparationSchema
>;

export const AppSettingsPrepareRequestSchema = z.object({
  project_id: ProjectIdSchema,
  package_id: z.string().min(1),
});
export type AppSettingsPrepareRequest = z.infer<
  typeof AppSettingsPrepareRequestSchema
>;

export const AppSettingsSecretMutationOperationSchema = z.enum([
  'retain',
  'replace',
  'clear',
]);
export type AppSettingsSecretMutationOperation = z.infer<
  typeof AppSettingsSecretMutationOperationSchema
>;

export const AppSettingsSecretMutationSchema = z
  .object({
    operation: AppSettingsSecretMutationOperationSchema.default('retain'),
    value: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.operation === 'replace' && !value.value) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'replace requires a secret value',
        path: ['value'],
      });
    }
    if (value.operation !== 'replace' && value.value !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'secret value is only valid for replace operations',
        path: ['value'],
      });
    }
  });
export type AppSettingsSecretMutation = z.infer<
  typeof AppSettingsSecretMutationSchema
>;

export const AppSettingsSaveRequestSchema = z.object({
  project_id: ProjectIdSchema,
  package_id: z.string().min(1),
  actor_id: z.string().min(1),
  expected_config_version: z.string().min(1),
  config: z.record(z.unknown()).default({}),
  secrets: z.record(AppSettingsSecretMutationSchema).default({}),
  evidence_refs: z.array(z.string().min(1)).default([]),
});
export type AppSettingsSaveRequest = z.infer<
  typeof AppSettingsSaveRequestSchema
>;

export const AppSettingsApplyStatusSchema = z.enum([
  'applied',
  'reverted',
  'blocked',
]);
export type AppSettingsApplyStatus = z.infer<
  typeof AppSettingsApplyStatusSchema
>;

export const AppSettingsSavePhaseSchema = z.enum([
  'validation',
  'deactivation',
  'config_update',
  'activation',
  'recovery',
  'completed',
]);
export type AppSettingsSavePhase = z.infer<
  typeof AppSettingsSavePhaseSchema
>;

export const AppSettingsSaveResultSchema = z.object({
  status: z.enum(['success', 'partial', 'failed']),
  apply_status: AppSettingsApplyStatusSchema,
  phase: AppSettingsSavePhaseSchema,
  validation: InstallValidationResultSchema,
  requested_config_version: z.string().min(1).optional(),
  effective_config_version: z.string().min(1),
  runtime: AppSettingsRuntimeSummarySchema,
  stored_secrets: z.array(AppSecretConfigStateSchema).default([]),
  activation_failure: AppInstallActivationFailureSchema.optional(),
  witness_refs: z.array(z.string().min(1)).default([]),
  rollback_applied: z.boolean().default(false),
  recoverable: z.boolean().default(true),
  metadata: z.record(z.unknown()).default({}),
});
export type AppSettingsSaveResult = z.infer<
  typeof AppSettingsSaveResultSchema
>;
