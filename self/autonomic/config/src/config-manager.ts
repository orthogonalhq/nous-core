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
 *
 * SP 1.3 — Decision 7 identity-persistence-schema-v1 readers/writers added.
 * The four agent-block readers synthesize typed defaults at read time when
 * the `agent` block is absent on disk; the four writers + clearAgentBlock
 * persist via a sibling-level shallow spread (preserves untargeted fields
 * inside `agent`) and validate the candidate config through the Zod schema
 * before writing.
 */
import { writeFileSync } from 'node:fs';
import { ConfigError } from '@nous/shared';
import type {
  IConfig,
  SystemConfig as BaseSystemConfig,
} from '@nous/shared';
import {
  SystemConfigSchema,
  type SystemConfig,
  type AgentBlock,
  type PersonalityConfig,
  type UserProfile,
} from './schema.js';
import { loadConfig } from './loader.js';

// SP 1.3 — module-level frozen defaults for the agent-block readers.
//
// Frozen so that callers that mutate the returned reference cannot
// accidentally pollute the shared default. Module-level so that every call
// returns the same reference (allows callers to compare against the sentinel
// — used by tests A2/A3 in agent-block-readers-writers.test.ts).
const DEFAULT_AGENT_NAME = 'Nous';
const DEFAULT_PERSONALITY_CONFIG: PersonalityConfig = Object.freeze({
  preset: 'balanced' as const,
});
const DEFAULT_USER_PROFILE: UserProfile = Object.freeze({});
const DEFAULT_WELCOME_MESSAGE_SENT = false;

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

  // ───────────────────────────────────────────────────────────────────
  // SP 1.3 — Decision 7 identity-persistence-schema-v1 readers.
  //
  // O(1) in-memory accesses. Read from `this.config.agent?.<field>` and
  // synthesize the module-level frozen sentinel when absent. NEVER write
  // to disk during reads (asserted by reader-purity test B1).
  // ───────────────────────────────────────────────────────────────────

  getAgentName(): string {
    return this.config.agent?.name ?? DEFAULT_AGENT_NAME;
  }

  getPersonalityConfig(): PersonalityConfig {
    return this.config.agent?.personality ?? DEFAULT_PERSONALITY_CONFIG;
  }

  getUserProfile(): UserProfile {
    return this.config.agent?.profile ?? DEFAULT_USER_PROFILE;
  }

  getWelcomeMessageSent(): boolean {
    return this.config.agent?.welcomeMessageSent ?? DEFAULT_WELCOME_MESSAGE_SENT;
  }

  // ───────────────────────────────────────────────────────────────────
  // SP 1.3 — Decision 7 writers.
  //
  // Writer pattern note (SP 1.3 — folds SDS-review Note 4):
  //
  // Each writer composes the next AgentBlock via a SIBLING-LEVEL SHALLOW
  // SPREAD of the current `agent` block:
  //
  //     { ...this.config.agent, <field>: value }
  //
  // Spreading `undefined` is a no-op in object literals (per ECMAScript
  // spec), so when `this.config.agent` is absent the writer creates a
  // single-field block; when it is present, the writer preserves all
  // sibling fields. This preserves SIBLING fields of the targeted field
  // inside `agent` (e.g., setPersonalityConfig preserves `name`,
  // `welcomeMessageSent`, `profile`). It is NOT a deep merge — the
  // targeted field is REPLACED WHOLESALE (e.g., setPersonalityConfig({
  // preset: 'professional' }) replaces the full PersonalityConfig
  // including any prior `overrides`). This matches SDS § 3.4 and Goals
  // C12-C14: writers take complete typed values, not partials.
  //
  // The existing `update()` shallow-merges at the SECTION level — that
  // pattern is insufficient for `agent.*` field-level preservation, hence
  // the dedicated `writeAgentBlock` helper below.
  // ───────────────────────────────────────────────────────────────────

  private async writeAgentBlock(next: AgentBlock | undefined): Promise<void> {
    const candidate: SystemConfig = next === undefined
      ? { ...this.config, agent: undefined }
      : { ...this.config, agent: next };

    const result = SystemConfigSchema.safeParse(candidate);
    if (!result.success) {
      const fieldErrors = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      throw new ConfigError(
        `Agent block validation failed: ${fieldErrors.length} error(s)`,
        { section: 'agent', errors: fieldErrors },
      );
    }

    this.config = result.data;

    if (this.configPath) {
      // JSON.stringify drops top-level keys with `undefined` values per
      // ECMAScript spec — so `clearAgentBlock` writes a config file with no
      // `"agent"` key, not `"agent": null`.
      writeFileSync(
        this.configPath,
        JSON.stringify(this.config, null, 2),
        'utf-8',
      );
    }
  }

  async setAgentName(name: string): Promise<void> {
    // Sibling-level shallow spread — see writer pattern note above.
    // Spreading undefined `this.config.agent` is safe (no-op); oxlint
    // unicorn/no-useless-fallback-in-spread flags `?? {}` as unnecessary.
    const next: AgentBlock = { ...this.config.agent, name };
    await this.writeAgentBlock(next);
    console.log(`[nous:config] Section 'agent' updated (name)`);
  }

  async setPersonalityConfig(config: PersonalityConfig): Promise<void> {
    const next: AgentBlock = { ...this.config.agent, personality: config };
    await this.writeAgentBlock(next);
    console.log(`[nous:config] Section 'agent' updated (personality)`);
  }

  async setUserProfile(profile: UserProfile): Promise<void> {
    const next: AgentBlock = { ...this.config.agent, profile };
    await this.writeAgentBlock(next);
    console.log(`[nous:config] Section 'agent' updated (profile)`);
  }

  async setWelcomeMessageSent(value: boolean): Promise<void> {
    const next: AgentBlock = { ...this.config.agent, welcomeMessageSent: value };
    await this.writeAgentBlock(next);
    console.log(`[nous:config] Section 'agent' updated (welcomeMessageSent)`);
  }

  async clearAgentBlock(): Promise<void> {
    if (this.config.agent === undefined) {
      // No-op when block already absent. Preserves I9 trivially and avoids
      // an unnecessary disk write (mtime unchanged — Block F2 assertion).
      return;
    }
    await this.writeAgentBlock(undefined);
    console.log(`[nous:config] Section 'agent' cleared`);
  }
}
