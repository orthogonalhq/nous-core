/**
 * ConfigManager — IConfig implementation wrapping the Phase 1.1 schema and loader.
 *
 * Provides section-level access, runtime updates with validation,
 * and disk reload. update() writes JSON to disk (comments in the
 * original JSON5 file are not preserved — acceptable for Phase 1).
 *
 * The IConfig interface uses a minimal SystemConfig type (index signature)
 * to avoid circular dependencies between shared and autonomic/config.
 * This implementation uses the full Zod-inferred SystemConfig internally
 * and conforms to the interface's generic signatures through explicit typing.
 */
import { writeFileSync } from 'node:fs';
import { ConfigError } from '@nous/shared';
import type {
  IConfig,
  SystemConfig as BaseSystemConfig,
} from '@nous/shared';
import { SystemConfigSchema, type SystemConfig } from './schema.js';
import { loadConfig } from './loader.js';

export class ConfigManager implements IConfig {
  private config: SystemConfig;
  private configPath: string | undefined;

  constructor(options?: { configPath?: string }) {
    this.configPath = options?.configPath;
    this.config = loadConfig(this.configPath);

    const source = this.configPath ?? 'defaults';
    console.log(`[nous:config] Configuration loaded from ${source}`);
  }

  get(): BaseSystemConfig {
    return { ...this.config };
  }

  getSection<K extends keyof BaseSystemConfig>(
    section: K,
  ): BaseSystemConfig[K] {
    return this.config[section as keyof SystemConfig] as BaseSystemConfig[K];
  }

  async update<K extends keyof BaseSystemConfig>(
    section: K,
    value: Partial<BaseSystemConfig[K]>,
  ): Promise<void> {
    const sectionKey = section as keyof SystemConfig;
    const currentSection = this.config[sectionKey];

    // Shallow merge at the section level (Object.assign semantics)
    const mergedSection =
      typeof currentSection === 'object' &&
      currentSection !== null &&
      !Array.isArray(currentSection)
        ? { ...currentSection, ...(value as Record<string, unknown>) }
        : value;

    const candidate = { ...this.config, [sectionKey]: mergedSection };

    // Validate the full config — throws ConfigError on failure
    const result = SystemConfigSchema.safeParse(candidate);
    if (!result.success) {
      const fieldErrors = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      throw new ConfigError(
        `Config update validation failed: ${fieldErrors.length} error(s) in section "${String(section)}"`,
        { section: String(section), errors: fieldErrors },
      );
    }

    // Update in-memory config
    this.config = result.data;

    // Persist to disk if we have a config path
    if (this.configPath) {
      writeFileSync(
        this.configPath,
        JSON.stringify(this.config, null, 2),
        'utf-8',
      );
    }

    console.log(`[nous:config] Section '${String(section)}' updated`);
  }

  async reload(): Promise<void> {
    if (!this.configPath) {
      return;
    }

    // loadConfig validates — on failure it throws ConfigError,
    // and this.config is preserved (not yet overwritten)
    const reloaded = loadConfig(this.configPath);
    this.config = reloaded;

    console.log(
      `[nous:config] Configuration reloaded from ${this.configPath}`,
    );
  }
}
