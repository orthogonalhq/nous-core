/**
 * Configuration schema for Nous-OSS.
 *
 * Zod schemas for the full system configuration including PFC tier presets,
 * model role assignments, deployment profiles, and storage backends.
 */
import { z } from 'zod';
import {
  PfcTierSchema,
  ModelRoleSchema,
  ProjectTypeSchema,
  GovernanceLevelSchema,
  EscalationChannelSchema,
  ProviderTypeSchema,
  MemoryAccessPolicySchema,
  ProviderIdSchema,
} from '@nous/shared';

// --- PFC Tier Preset ---
// What each tier enables — from pfc-mode-capability-matrix.mdx.
export const PfcTierPresetSchema = z.object({
  tier: PfcTierSchema,
  name: z.string(),
  description: z.string(),
  reflection: z.enum([
    'none',
    'minimal',
    'basic',
    'two-pass',
    'multi-pass',
    'advanced',
  ]),
  memoryGating: z.boolean(),
  toolAuthorization: z.boolean(),
  planning: z.boolean(),
  escalationDetection: z.boolean(),
  targetModelClass: z.string(),
});
export type PfcTierPreset = z.infer<typeof PfcTierPresetSchema>;

// --- Model Role Assignment ---
// Which provider fulfills which role.
export const ModelRoleAssignmentSchema = z.object({
  role: ModelRoleSchema,
  providerId: ProviderIdSchema,
  fallbackProviderId: ProviderIdSchema.optional(),
});
export type ModelRoleAssignment = z.infer<typeof ModelRoleAssignmentSchema>;

// --- Provider Configuration (for config file) ---
export const ProviderConfigEntrySchema = z.object({
  id: ProviderIdSchema,
  name: z.string(),
  type: ProviderTypeSchema,
  endpoint: z.string().optional(),
  modelId: z.string(),
  isLocal: z.boolean(),
  maxTokens: z.number().positive().optional(),
  capabilities: z.array(z.string()),
});
export type ProviderConfigEntry = z.infer<typeof ProviderConfigEntrySchema>;

// --- Profile ---
// Deployment profile.
export const ProfileSchema = z.object({
  name: z.enum(['local-only', 'remote-only', 'hybrid']),
  description: z.string(),
  defaultProviderType: z.enum(['local', 'remote']),
  allowLocalProviders: z.boolean(),
  allowRemoteProviders: z.boolean(),
});
export type Profile = z.infer<typeof ProfileSchema>;

// --- Storage Configuration ---
export const StorageConfigSchema = z.object({
  dataDir: z.string(),
  documentBackend: z.enum(['sqlite']).default('sqlite'),
  vectorBackend: z.enum(['stub']).default('stub'),
  graphBackend: z.enum(['stub']).default('stub'),
  storageEncryption: z.boolean().optional().default(false),
});
export type StorageConfig = z.infer<typeof StorageConfigSchema>;

// --- Security Configuration ---
export const SecurityConfigSchema = z.object({
  traceSensitiveData: z.boolean().optional().default(false),
});
export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;

// --- Defaults ---
export const DefaultsConfigSchema = z.object({
  projectType: ProjectTypeSchema.default('hybrid'),
  governance: GovernanceLevelSchema.default('should'),
  memoryAccessPolicy: MemoryAccessPolicySchema.default({
    canReadFrom: 'all',
    canBeReadBy: 'all',
    inheritsGlobal: true,
  }),
  retrievalBudgetTokens: z.number().positive().default(500),
  escalationChannels: z.array(EscalationChannelSchema).default(['in-app']),
});
export type DefaultsConfig = z.infer<typeof DefaultsConfigSchema>;

// --- Full System Configuration ---
export const SystemConfigSchema = z.object({
  profile: ProfileSchema,
  pfcTier: PfcTierSchema,
  pfcTierPresets: z.array(PfcTierPresetSchema),
  modelRoleAssignments: z.array(ModelRoleAssignmentSchema),
  providers: z.array(ProviderConfigEntrySchema),
  defaults: DefaultsConfigSchema,
  storage: StorageConfigSchema,
  security: SecurityConfigSchema.optional().default({
    traceSensitiveData: false,
  }),
});
export type SystemConfig = z.infer<typeof SystemConfigSchema>;
