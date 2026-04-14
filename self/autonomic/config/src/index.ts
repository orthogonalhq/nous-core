/**
 * @nous/autonomic-config — Configuration schema and validation for Nous-OSS.
 */
export {
  SystemConfigSchema,
  PfcTierPresetSchema,
  ModelRoleAssignmentSchema,
  ProfileSchema,
  StorageConfigSchema,
  SecurityConfigSchema,
  DefaultsConfigSchema,
  ProviderConfigEntrySchema,
  LoggingConfigSchema,
} from './schema.js';
export type {
  SystemConfig,
  PfcTierPreset,
  ModelRoleAssignment,
  Profile,
  StorageConfig,
  SecurityConfig,
  DefaultsConfig,
  ProviderConfigEntry,
  LoggingConfig,
} from './schema.js';

export {
  DEFAULT_PFC_TIER_PRESETS,
  DEFAULT_PROFILES,
  DEFAULT_SYSTEM_CONFIG,
} from './defaults.js';

export { loadConfig } from './loader.js';

export { ConfigManager } from './config-manager.js';

export { normalizeProfileName } from './profile-normalize.js';
