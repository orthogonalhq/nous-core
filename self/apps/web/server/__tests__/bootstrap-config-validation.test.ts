/**
 * Bootstrap validation tests.
 *
 * Ensures app startup fails fast when config contains invalid provider IDs.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { DEFAULT_SYSTEM_CONFIG } from '@nous/autonomic-config';
import { createNousContext, clearNousContextCache } from '../bootstrap';

describe('bootstrap config validation', () => {
  const originalDataDir = process.env.NOUS_DATA_DIR;
  const originalConfigPath = process.env.NOUS_CONFIG_PATH;

  afterEach(() => {
    if (originalDataDir === undefined) {
      delete process.env.NOUS_DATA_DIR;
    } else {
      process.env.NOUS_DATA_DIR = originalDataDir;
    }

    if (originalConfigPath === undefined) {
      delete process.env.NOUS_CONFIG_PATH;
    } else {
      process.env.NOUS_CONFIG_PATH = originalConfigPath;
    }

    clearNousContextCache();
  });

  it('throws on startup when provider ids are not UUIDs', () => {
    const dataDir = join(tmpdir(), `nous-web-invalid-config-${randomUUID()}`);
    mkdirSync(dataDir, { recursive: true });
    const configPath = join(dataDir, 'config.json5');

    const invalidConfig = JSON.parse(
      JSON.stringify(DEFAULT_SYSTEM_CONFIG),
    ) as Record<string, unknown>;

    invalidConfig.modelRoleAssignments = [
      { role: 'reasoner', providerId: 'ollama-default' },
    ];
    invalidConfig.providers = [
      {
        id: 'ollama-default',
        name: 'Ollama',
        type: 'text',
        modelId: 'llama3.2:3b',
        isLocal: true,
        capabilities: [],
      },
    ];

    writeFileSync(configPath, JSON.stringify(invalidConfig, null, 2), 'utf-8');

    process.env.NOUS_DATA_DIR = dataDir;
    process.env.NOUS_CONFIG_PATH = configPath;
    clearNousContextCache();

    expect(() => createNousContext()).toThrow(
      /Config validation failed|invalid id|valid UUID/i,
    );
  });

  it('wires workflow, artifact, mao, scheduler, and escalation services into the web context', () => {
    const dataDir = join(tmpdir(), `nous-web-context-${randomUUID()}`);
    mkdirSync(dataDir, { recursive: true });

    process.env.NOUS_DATA_DIR = dataDir;
    delete process.env.NOUS_CONFIG_PATH;
    clearNousContextCache();

    const ctx = createNousContext();
    expect(ctx.workflowEngine).toBeDefined();
    expect(ctx.artifactStore).toBeDefined();
    expect(ctx.maoProjectionService).toBeDefined();
    expect(ctx.schedulerService).toBeDefined();
    expect(ctx.escalationService).toBeDefined();
  });
});
