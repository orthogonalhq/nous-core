import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig } from '../loader.js';
import { DEFAULT_SYSTEM_CONFIG } from '../defaults.js';
import { ConfigError } from '@nous/shared';

const TEST_DIR = join(tmpdir(), 'nous-config-test-' + Date.now());

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('returns default config when no path provided', () => {
    const config = loadConfig();
    expect(config).toEqual(DEFAULT_SYSTEM_CONFIG);
  });

  it('loads and validates a valid JSON5 config', () => {
    const configPath = join(TEST_DIR, 'valid.json5');
    // JSON5 supports comments
    const content = `{
      // This is a valid config
      profile: {
        name: "local-only",
        description: "Test",
        defaultProviderType: "local",
        allowLocalProviders: true,
        allowRemoteProviders: false,
      },
      pfcTier: 3,
      pfcTierPresets: ${JSON.stringify(DEFAULT_SYSTEM_CONFIG.pfcTierPresets)},
      modelRoleAssignments: [],
      providers: [],
      defaults: {},
      storage: {
        dataDir: "./test-data",
      },
    }`;
    writeFileSync(configPath, content, 'utf-8');

    const config = loadConfig(configPath);
    expect(config.pfcTier).toBe(3);
    expect(config.profile.name).toBe('local-only');
    expect(config.storage.dataDir).toBe('./test-data');
    // Check defaults were applied
    expect(config.defaults.projectType).toBe('hybrid');
    expect(config.defaults.governance).toBe('should');
  });

  it('throws ConfigError for non-existent file', () => {
    expect(() => loadConfig(join(TEST_DIR, 'nope.json5'))).toThrow(ConfigError);
  });

  it('throws ConfigError for malformed JSON5', () => {
    const configPath = join(TEST_DIR, 'bad.json5');
    writeFileSync(configPath, '{ this is not valid json5 !!!', 'utf-8');

    expect(() => loadConfig(configPath)).toThrow(ConfigError);
  });

  it('throws ConfigError with field details for schema-invalid config', () => {
    const configPath = join(TEST_DIR, 'invalid.json5');
    const content = JSON.stringify({
      profile: {
        name: 'invalid-profile',
        description: 'Test',
        defaultProviderType: 'local',
        allowLocalProviders: true,
        allowRemoteProviders: false,
      },
      pfcTier: 99,
      pfcTierPresets: [],
      modelRoleAssignments: [],
      providers: [],
      defaults: {},
      storage: { dataDir: './data' },
    });
    writeFileSync(configPath, content, 'utf-8');

    try {
      loadConfig(configPath);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      const configErr = err as ConfigError;
      expect(configErr.context?.errors).toBeDefined();
      expect(Array.isArray(configErr.context?.errors)).toBe(true);
    }
  });

  it('throws ConfigError when provider or assignment ids are not UUIDs', () => {
    const configPath = join(TEST_DIR, 'invalid-provider-id.json5');
    const content = JSON.stringify({
      ...DEFAULT_SYSTEM_CONFIG,
      providers: [
        {
          id: 'ollama-default',
          name: 'Ollama',
          type: 'text',
          modelId: 'llama3.2:3b',
          isLocal: true,
          capabilities: [],
        },
      ],
      modelRoleAssignments: [
        {
          role: 'reasoner',
          providerId: 'ollama-default',
        },
      ],
    });
    writeFileSync(configPath, content, 'utf-8');

    expect(() => loadConfig(configPath)).toThrow(ConfigError);
  });
});
