/**
 * @nous/autonomic-config — Configuration schema and validation for Nous-OSS.
 */
export {
  SystemConfigSchema,
  PfcTierPresetSchema,
  ModelRoleAssignmentSchema,
  ProfileSchema,
  StorageConfigSchema,
  DefaultsConfigSchema,
  ProviderConfigEntrySchema,
} from './schema.js';
export type {
  SystemConfig,
  PfcTierPreset,
  ModelRoleAssignment,
  Profile,
  StorageConfig,
  DefaultsConfig,
  ProviderConfigEntry,
} from './schema.js';

export {
  DEFAULT_PFC_TIER_PRESETS,
  DEFAULT_PROFILES,
  DEFAULT_SYSTEM_CONFIG,
} from './defaults.js';

export { loadConfig } from './loader.js';
