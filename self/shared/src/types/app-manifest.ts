import { z } from 'zod';
import {
  AppPermissionsSchema,
  type AppPermissions,
} from './app-permissions.js';
import {
  applySelfCreatedOwnershipValidation,
  CanonicalGenericPackageManifestSchema,
  CanonicalNousPackageManifestObjectSchema,
  type CanonicalGenericPackageManifest,
} from './package-manifest.js';

export const AppToolRiskLevelSchema = z.enum(['low', 'medium', 'high', 'critical']);
export type AppToolRiskLevel = z.infer<typeof AppToolRiskLevelSchema>;

export const AppToolMemoryRelevanceSchema = z.enum(['high', 'medium', 'low']);
export type AppToolMemoryRelevance = z.infer<typeof AppToolMemoryRelevanceSchema>;

export const AppToolDeclarationSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.record(z.unknown()),
  riskLevel: AppToolRiskLevelSchema,
  idempotent: z.boolean(),
  sideEffects: z.array(z.string().min(1)).default([]),
  memoryRelevance: AppToolMemoryRelevanceSchema.default('medium'),
  memoryHint: z.string().min(1).optional(),
});
export type AppToolDeclaration = z.infer<typeof AppToolDeclarationSchema>;

export const AppConfigFieldTypeSchema = z.enum([
  'string',
  'number',
  'boolean',
  'secret',
  'select',
]);
export type AppConfigFieldType = z.infer<typeof AppConfigFieldTypeSchema>;

export const AppConfigFieldSchema = z.object({
  type: AppConfigFieldTypeSchema,
  required: z.boolean().default(false),
  label: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  default: z.unknown().optional(),
  options: z.array(z.string().min(1)).optional(),
  validation: z.string().min(1).optional(),
  group: z.string().min(1).optional(),
});
export type AppConfigField = z.infer<typeof AppConfigFieldSchema>;

export const AppConfigSchema = z.record(AppConfigFieldSchema);
export type AppConfig = z.infer<typeof AppConfigSchema>;

export const AppPanelPositionSchema = z.enum(['left', 'right', 'bottom', 'main']);
export type AppPanelPosition = z.infer<typeof AppPanelPositionSchema>;

export const AppPanelBadgeTypeSchema = z.enum(['dot', 'count', 'status']);
export type AppPanelBadgeType = z.infer<typeof AppPanelBadgeTypeSchema>;

export const AppPanelBadgeSchema = z.object({
  type: AppPanelBadgeTypeSchema,
  value: z.union([z.string(), z.number()]).optional(),
});
export type AppPanelBadge = z.infer<typeof AppPanelBadgeSchema>;

export const AppPanelDeclarationSchema = z.object({
  panelId: z.string().min(1),
  label: z.string().min(1),
  entry: z.string().min(1),
  icon: z.string().min(1).optional(),
  position: AppPanelPositionSchema.optional(),
  badge: AppPanelBadgeSchema.optional(),
  preserveState: z.boolean().default(true),
});
export type AppPanelDeclaration = z.infer<typeof AppPanelDeclarationSchema>;

export const AppLifecycleHooksSchema = z.object({
  onInstall: z.string().min(1).optional(),
  onActivate: z.string().min(1).optional(),
  onDeactivate: z.string().min(1).optional(),
  onUninstall: z.string().min(1).optional(),
  onUpdate: z.string().min(1).optional(),
});
export type AppLifecycleHooks = z.infer<typeof AppLifecycleHooksSchema>;

export const AppAdapterDeclarationSchema = z.object({
  name: z.string().min(1),
  healthCheckRef: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});
export type AppAdapterDeclaration = z.infer<typeof AppAdapterDeclarationSchema>;

export const InstallValidationEntrySchema = z.object({
  field: z.string().min(1).optional(),
  check: z.string().min(1),
  passed: z.boolean(),
  message: z.string().min(1).optional(),
  retryable: z.boolean().optional(),
});
export type InstallValidationEntry = z.infer<typeof InstallValidationEntrySchema>;

export const InstallValidationResultSchema = z.object({
  status: z.enum(['success', 'partial', 'failed']),
  results: z.array(InstallValidationEntrySchema).default([]),
});
export type InstallValidationResult = z.infer<typeof InstallValidationResultSchema>;

export const OAuthConfigSchema = z.object({
  provider: z.string().min(1),
  scopes: z.array(z.string().min(1)).default([]),
  callbackPath: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type OAuthConfig = z.infer<typeof OAuthConfigSchema>;

export const OAuthResultSchema = z.object({
  status: z.enum(['success', 'cancelled', 'failed']),
  credentialRef: z.string().min(1).optional(),
  grantedScopes: z.array(z.string().min(1)).default([]),
  expiresAt: z.string().datetime().optional(),
  reason: z.string().min(1).optional(),
});
export type OAuthResult = z.infer<typeof OAuthResultSchema>;

export const AppPackageManifestSchema = applySelfCreatedOwnershipValidation(
  CanonicalNousPackageManifestObjectSchema.extend({
    package_type: z.literal('app'),
    permissions: AppPermissionsSchema,
    tools: z.array(AppToolDeclarationSchema).min(1),
    panels: z.array(AppPanelDeclarationSchema).optional(),
    config: AppConfigSchema.optional(),
    adapters: z.array(AppAdapterDeclarationSchema).optional(),
    lifecycle: AppLifecycleHooksSchema.optional(),
  }),
);
export type AppPackageManifest = z.infer<typeof AppPackageManifestSchema>;

export const CanonicalPackageManifestSchema = z.union([
  AppPackageManifestSchema,
  CanonicalGenericPackageManifestSchema,
]);
export type CanonicalPackageManifest = z.infer<typeof CanonicalPackageManifestSchema>;

export type NonAppPackageManifest = CanonicalGenericPackageManifest;
export { AppPermissionsSchema };
export type { AppPermissions };
