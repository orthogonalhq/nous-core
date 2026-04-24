/**
 * Configuration schema for Nous-OSS.
 *
 * Zod schemas for the full system configuration including Cortex tier presets,
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
  ProviderClassSchema,
  ProviderVendorSchema,
  StmCompactionPolicySchema,
  DEFAULT_STM_COMPACTION_POLICY,
  LogLevel,
} from '@nous/shared';

// --- Cortex Tier Preset ---
// What each tier enables — from Cortex-mode-capability-matrix.mdx.
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
// `vendor` mirrors `ModelProviderConfigSchema.vendor` from `@nous/shared`
// (WR-138 row #2). Optional at introduction for backward-compat with legacy
// persisted config files. See `provider-vendor-field-v1.md` § 5 / AC #5.
export const ProviderConfigEntrySchema = z.object({
  id: ProviderIdSchema,
  name: z.string(),
  type: ProviderTypeSchema,
  endpoint: z.string().optional(),
  modelId: z.string(),
  isLocal: z.boolean(),
  maxTokens: z.number().positive().optional(),
  capabilities: z.array(z.string()),
  providerClass: ProviderClassSchema.optional(),
  meetsProfiles: z.array(z.string()).optional(),
  vendor: ProviderVendorSchema.optional(),
});
export type ProviderConfigEntry = z.infer<typeof ProviderConfigEntrySchema>;

// --- Profile Name (legacy + canonical, Phase 2.3) ---
export const ProfileNameSchema = z.enum([
  'local-only',
  'remote-only',
  'hybrid',
  'local_strict',
  'hybrid_controlled',
  'remote_primary',
]);
export type ProfileName = z.infer<typeof ProfileNameSchema>;

// --- Profile ---
// Deployment profile.
export const ProfileSchema = z.object({
  name: ProfileNameSchema,
  description: z.string(),
  defaultProviderType: z.enum(['local', 'remote']),
  allowLocalProviders: z.boolean(),
  allowRemoteProviders: z.boolean(),
  allowSilentLocalToRemoteFailover: z.boolean().optional().default(false),
});
export type Profile = z.infer<typeof ProfileSchema>;

// --- Credential Lookup Key (Phase 2.3) ---
export const CredentialPurposeSchema = z.enum(['api_key', 'bearer', 'inference']);
export type CredentialPurpose = z.infer<typeof CredentialPurposeSchema>;

export const CredentialLookupKeySchema = z.object({
  projectId: z.string().uuid().optional(),
  profileId: z.string(),
  providerClass: ProviderClassSchema,
  credentialPurpose: CredentialPurposeSchema,
});
export type CredentialLookupKey = z.infer<typeof CredentialLookupKeySchema>;

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
  stmCompactionPolicy: StmCompactionPolicySchema.default(
    DEFAULT_STM_COMPACTION_POLICY,
  ),
  escalationChannels: z.array(EscalationChannelSchema).default(['in-app']),
});
export type DefaultsConfig = z.infer<typeof DefaultsConfigSchema>;

// --- Logging Configuration ---
export const LoggingConfigSchema = z.object({
  level: z.nativeEnum(LogLevel).optional().default(LogLevel.Debug),
  channels: z.record(z.string(), z.boolean()).optional().default({}),
}).optional().default({});
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;

// --- Cost Governance Configuration ---
// WR-162 SP 2 — cost-enforcement-pause-fix-v1.md § Config key.
// When `enforcementEnabled === false`, the ConfigLocked invariant is relaxed
// for the enforcement pause window. Default posture is paused in V1.
export const CostConfigSchema = z.object({
  enforcementEnabled: z.boolean().optional().default(false),
});
export type CostConfig = z.infer<typeof CostConfigSchema>;

// --- Supervisor Bootstrap Configuration ---
// WR-162 SP 3 — supervisor-topology-architecture-v1.md + SP 3 SDS § Data Model.
// `enabled: true` constructs an active `SupervisorService` + registers the
// composite outbox sink on child gateways (OBS-004). `enabled: false` is
// SUPV-SP3-002 (construct-but-no-op): `SupervisorService` is still built so
// read procedures/tests can exercise the surface, but `startSupervision()`
// returns an inert handle (`isActive() === false`) and no sink registers.
//
// WR-162 SP 6 (SUPV-SP6-014) — `sentinelThresholds` nested object landed per
// `sentinel-model-contract-v1.md § Threshold Configuration`. Values are read
// once at bootstrap; no hot-reload in V1 (SUPV-SP3-002 posture inherited).
export const SupervisorBootstrapConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  sentinelThresholds: z
    .object({
      retryCountPerWindow: z.number().int().positive().default(10),
      retryWindowSeconds: z.number().int().positive().default(60),
      escalationCountPerWindow: z.number().int().positive().default(3),
      escalationWindowSeconds: z.number().int().positive().default(60),
      stalledAgentIdleSeconds: z.number().int().positive().default(300),
      heartbeatIntervalMs: z.number().int().positive().default(5000),
    })
    .optional()
    .default({
      retryCountPerWindow: 10,
      retryWindowSeconds: 60,
      escalationCountPerWindow: 3,
      escalationWindowSeconds: 60,
      stalledAgentIdleSeconds: 300,
      heartbeatIntervalMs: 5000,
    }),
});
export type SupervisorBootstrapConfig = z.infer<
  typeof SupervisorBootstrapConfigSchema
>;

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
  logging: LoggingConfigSchema,
  cost: CostConfigSchema.optional().default({ enforcementEnabled: false }),
  supervisor: SupervisorBootstrapConfigSchema.optional().default({
    enabled: true,
  }),
});
export type SystemConfig = z.infer<typeof SystemConfigSchema>;
