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

// --- Agent Block (SP 1.3 — Decision 7 identity-persistence-schema-v1) ---
//
// The `agent` block is the canonical persistence site for everything the
// onboarding wizard authors about the agent: name, personality, welcome flag,
// and a typed-and-optional user profile. Per Decision 7, defaults are
// synthesized at read time by `ConfigManager`'s readers and are NEVER written
// to disk until the user configures. The entire block is optional at the top
// level; configs without it validate.
//
// Personality types are declared here as a structural mirror of SP 1.2's
// canonical types in `self/cortex/core/src/gateway-runtime/personality/`. The
// shapes are byte-equivalent (proven by `personality-mirror-compat.test.ts`).
// Per ADR 018 the `@nous/shared` mirror is the boundary surface for the
// `IConfig` interface — see SDS § 1.3 / I1.

// Personality preset enum (mirrors SP 1.2's PersonalityPreset literal type).
export const PersonalityPresetSchema = z.enum([
  'balanced',
  'professional',
  'efficient',
  'thorough',
]);
export type PersonalityPreset = z.infer<typeof PersonalityPresetSchema>;

// Trait-axes overrides — Partial<TraitAxes> at the type layer. Each field is
// optional; unknown keys rejected by `.strict()`. Enum values byte-match SP 1.2's
// `TraitAxes`.
export const TraitAxesOverridesSchema = z.object({
  thoroughness: z.enum(['strict', 'standard']).optional(),
  initiative: z.enum(['collaborative', 'compliant']).optional(),
  candor: z.enum(['strict', 'standard']).optional(),
  communicationStyle: z.enum(['detailed', 'concise']).optional(),
  codeStyle: z.enum(['minimal', 'standard']).optional(),
}).strict();
export type TraitAxesOverrides = z.infer<typeof TraitAxesOverridesSchema>;

// PersonalityConfig — preset + optional overrides.
export const PersonalityConfigSchema = z.object({
  preset: PersonalityPresetSchema,
  overrides: TraitAxesOverridesSchema.optional(),
}).strict();
export type PersonalityConfig = z.infer<typeof PersonalityConfigSchema>;

// UserProfile — Decision 7's typed-and-optional V1 roster (per Goals R9).
// V1 fields map to SP 1.4's identity sub-stage UX:
//   - displayName: user's preferred name for the agent to use
//   - role: user's role/title
//   - primaryUseCase: short free-text description of what the user is working on
//   - expertise: the user's familiarity with their domain
// Every field is optional; absent fields produce a `{}` shape from the reader.
// Adding a field is an additive Zod schema change; renaming or removing
// requires explicit migration (Decision 7 § Profile Schema Constraints).
export const UserProfileSchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  role: z.string().min(1).max(120).optional(),
  primaryUseCase: z.string().min(1).max(500).optional(),
  expertise: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
}).strict();
export type UserProfile = z.infer<typeof UserProfileSchema>;

// AgentBlock — the new top-level block. Every nested field is optional so
// partial blocks (e.g., `{ name: "Nia" }` only) validate. Empty profile (`{}`)
// is allowed and is the default the reader synthesizes (C8).
export const AgentBlockSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  personality: PersonalityConfigSchema.optional(),
  welcomeMessageSent: z.boolean().optional(),
  profile: UserProfileSchema.optional(),
}).strict();
export type AgentBlock = z.infer<typeof AgentBlockSchema>;

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
  // SP 1.3 — Decision 7 identity-persistence-schema-v1.
  // Optional at the top level. Defaults are synthesized at read time by
  // ConfigManager's `getAgent*` readers; never written to disk until the user
  // configures via the wizard.
  agent: AgentBlockSchema.optional(),
});
export type SystemConfig = z.infer<typeof SystemConfigSchema>;
