/**
 * Configuration loader for Nous-OSS.
 *
 * Loads a JSON5 configuration file, validates it with Zod,
 * and returns a typed SystemConfig. Falls back to defaults
 * if no path is provided.
 */
import { readFileSync } from 'node:fs';
import JSON5 from 'json5';
import { ConfigError } from '@nous/shared';
import { SystemConfigSchema, type SystemConfig } from './schema.js';
import { DEFAULT_SYSTEM_CONFIG } from './defaults.js';
import { migrateSystemConfigModelRoleAssignments } from './migrate.js';

/**
 * Load and validate system configuration.
 *
 * @param path - Path to a JSON5 configuration file. If not provided, returns defaults.
 * @returns Validated SystemConfig
 * @throws ConfigError if the file cannot be read or fails validation
 */
export function loadConfig(path?: string): SystemConfig {
  if (!path) {
    return DEFAULT_SYSTEM_CONFIG;
  }

  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (err) {
    // First-boot: config file does not exist yet — fall back to defaults.
    // The file will be created on the first ConfigManager.update() call.
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log(`[nous:config] Config file not found at ${path}, using defaults (will be created on first update)`);
      return DEFAULT_SYSTEM_CONFIG;
    }
    throw new ConfigError(`Failed to read config file: ${path}`, {
      path,
      cause: err instanceof Error ? err.message : String(err),
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON5.parse(raw);
  } catch (err) {
    throw new ConfigError(`Failed to parse config file as JSON5: ${path}`, {
      path,
      cause: err instanceof Error ? err.message : String(err),
    });
  }

  const migrated = migrateSystemConfigModelRoleAssignments(parsed);
  const result = SystemConfigSchema.safeParse(migrated);
  if (!result.success) {
    const fieldErrors = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    throw new ConfigError(
      `Config validation failed: ${fieldErrors.length} error(s) in ${path}`,
      {
        path,
        errors: fieldErrors,
      },
    );
  }

  return result.data;
}
