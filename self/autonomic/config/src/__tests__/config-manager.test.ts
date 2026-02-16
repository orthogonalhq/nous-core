import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConfigError } from '@nous/shared';
import { ConfigManager } from '../config-manager.js';
import { DEFAULT_SYSTEM_CONFIG } from '../defaults.js';
import { loadConfig } from '../loader.js';
import type { SystemConfig } from '../schema.js';

const TEST_DIR = join(tmpdir(), 'nous-config-manager-test-' + Date.now());

function writeValidConfig(
  path: string,
  overrides: Record<string, unknown> = {},
): void {
  const config = { ...DEFAULT_SYSTEM_CONFIG, ...overrides };
  writeFileSync(path, JSON.stringify(config, null, 2), 'utf-8');
}

/** Helper to get the config as the specific Zod type for test assertions */
function getTypedConfig(manager: ConfigManager): SystemConfig {
  return manager.get() as unknown as SystemConfig;
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('ConfigManager', () => {
  // --- Tier 1: Contract tests ---

  describe('get()', () => {
    it('returns a valid SystemConfig', () => {
      const manager = new ConfigManager();
      const config = getTypedConfig(manager);
      expect(config).toHaveProperty('profile');
      expect(config).toHaveProperty('pfcTier');
      expect(config).toHaveProperty('pfcTierPresets');
      expect(config).toHaveProperty('modelRoleAssignments');
      expect(config).toHaveProperty('providers');
      expect(config).toHaveProperty('defaults');
      expect(config).toHaveProperty('storage');
    });

    it('returns default config when no configPath provided', () => {
      const manager = new ConfigManager();
      const config = getTypedConfig(manager);
      expect(config.pfcTier).toBe(DEFAULT_SYSTEM_CONFIG.pfcTier);
      expect(config.profile.name).toBe(DEFAULT_SYSTEM_CONFIG.profile.name);
    });
  });

  describe('getSection()', () => {
    it('returns the correct section by key', () => {
      const manager = new ConfigManager();
      const profile = manager.getSection('profile');
      expect(profile).toEqual(DEFAULT_SYSTEM_CONFIG.profile);

      const defaults = manager.getSection('defaults');
      expect(defaults).toEqual(DEFAULT_SYSTEM_CONFIG.defaults);
    });
  });

  describe('update()', () => {
    it('modifies a section and get() reflects the change', async () => {
      const manager = new ConfigManager();
      await manager.update('pfcTier', 4 as never);
      const config = getTypedConfig(manager);
      expect(config.pfcTier).toBe(4);
    });
  });

  describe('reload()', () => {
    it('picks up external file changes', async () => {
      const configPath = join(TEST_DIR, 'reload-test.json');
      writeValidConfig(configPath);

      const manager = new ConfigManager({ configPath });
      expect(getTypedConfig(manager).pfcTier).toBe(
        DEFAULT_SYSTEM_CONFIG.pfcTier,
      );

      // Externally modify the file
      const modified = { ...DEFAULT_SYSTEM_CONFIG, pfcTier: 5 };
      writeFileSync(configPath, JSON.stringify(modified, null, 2), 'utf-8');

      await manager.reload();
      expect(getTypedConfig(manager).pfcTier).toBe(5);
    });
  });

  // --- Tier 2: Behavior tests ---

  describe('update() merge semantics', () => {
    it('shallow-merges — sibling keys in the section are preserved', async () => {
      const manager = new ConfigManager();
      const originalProjectType =
        (getTypedConfig(manager).defaults as Record<string, unknown>)[
          'projectType'
        ];

      await manager.update('defaults', {
        governance: 'must',
      } as never);

      const updated = getTypedConfig(manager);
      const defaults = updated.defaults as Record<string, unknown>;
      expect(defaults['governance']).toBe('must');
      expect(defaults['projectType']).toBe(originalProjectType);
    });
  });

  describe('update() validation', () => {
    it('throws ConfigError for invalid values', async () => {
      const manager = new ConfigManager();
      await expect(
        manager.update('pfcTier', 99 as never),
      ).rejects.toThrow(ConfigError);
    });

    it('does not modify in-memory config on validation failure', async () => {
      const manager = new ConfigManager();
      const beforeTier = getTypedConfig(manager).pfcTier;

      try {
        await manager.update('pfcTier', 99 as never);
      } catch {
        // expected
      }

      expect(getTypedConfig(manager).pfcTier).toBe(beforeTier);
    });
  });

  describe('update() persistence', () => {
    it('persists changes to disk when configPath is set', async () => {
      const configPath = join(TEST_DIR, 'persist-test.json');
      writeValidConfig(configPath);

      const manager = new ConfigManager({ configPath });
      await manager.update('pfcTier', 3 as never);

      // Read the file directly and verify
      const onDisk = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(onDisk.pfcTier).toBe(3);
    });

    it('written file is loadable by loadConfig()', async () => {
      const configPath = join(TEST_DIR, 'round-trip-test.json');
      writeValidConfig(configPath);

      const manager = new ConfigManager({ configPath });
      await manager.update('pfcTier', 4 as never);

      // Verify the written file can be loaded by the original loader
      const reloaded = loadConfig(configPath);
      expect(reloaded.pfcTier).toBe(4);
    });
  });

  describe('reload() edge cases', () => {
    it('is a no-op when no configPath provided', async () => {
      const manager = new ConfigManager();
      const before = manager.get();
      await manager.reload();
      expect(manager.get()).toEqual(before);
    });

    it('preserves existing config when file becomes invalid', async () => {
      const configPath = join(TEST_DIR, 'invalid-reload.json');
      writeValidConfig(configPath);

      const manager = new ConfigManager({ configPath });
      const validConfig = manager.get();

      // Corrupt the file
      writeFileSync(configPath, '{ invalid json!!!', 'utf-8');

      await expect(manager.reload()).rejects.toThrow(ConfigError);
      // Config should be preserved
      expect(manager.get()).toEqual(validConfig);
    });
  });

  describe('constructor', () => {
    it('throws ConfigError with invalid configPath', () => {
      expect(
        () => new ConfigManager({ configPath: join(TEST_DIR, 'nope.json') }),
      ).toThrow(ConfigError);
    });
  });
});
