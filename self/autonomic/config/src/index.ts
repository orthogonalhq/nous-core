/**
 * @nous/autonomic-config — Configuration schema and validation for Nous-OSS.
 */
export {
  CostConfigSchema,
  DefaultsConfigSchema,
  LoggingConfigSchema,
  ModelRoleAssignmentSchema,
  PfcTierPresetSchema,
  ProfileSchema,
  ProviderConfigEntrySchema,
  SecurityConfigSchema,
  StorageConfigSchema,
  SystemConfigSchema,
} from './schema.js';
export type {
  CostConfig,
  DefaultsConfig,
  LoggingConfig,
  ModelRoleAssignment,
  PfcTierPreset,
  Profile,
  ProviderConfigEntry,
  SecurityConfig,
  StorageConfig,
  SystemConfig,
} from './schema.js';

export {
  DEFAULT_PFC_TIER_PRESETS,
  DEFAULT_PROFILES,
  DEFAULT_SYSTEM_CONFIG,
} from './defaults.js';

export { loadConfig } from './loader.js';

export { ConfigManager } from './config-manager.js';

export { normalizeProfileName } from './profile-normalize.js';
