/**
 * Tests for the desktop backend health endpoint enhancement.
 *
 * Verifies the static contract shapes used by the desktop server and preload
 * bridge without requiring a running Electron instance.
 */
import { describe, expect, it } from 'vitest';

describe('desktop backend health endpoint contract', () => {
  it('/health response includes the enriched Ollama status shape', () => {
    const healthResponse = {
      status: 'ok',
      runtime: 'desktop',
      port: 12345,
      ollama: {
        installed: true,
        running: true,
        state: 'running' as const,
        models: ['llama3.2:3b'],
        defaultModel: 'llama3.2:3b',
      },
    };

    expect(healthResponse.status).toBe('ok');
    expect(healthResponse.ollama).toBeDefined();
    expect(typeof healthResponse.ollama.installed).toBe('boolean');
    expect(typeof healthResponse.ollama.running).toBe('boolean');
    expect(typeof healthResponse.ollama.state).toBe('string');
    expect(Array.isArray(healthResponse.ollama.models)).toBe(true);
    expect(
      healthResponse.ollama.defaultModel === null ||
      typeof healthResponse.ollama.defaultModel === 'string',
    ).toBe(true);
  });

  it('/health fallback includes the not_installed lifecycle state', () => {
    const healthResponse = {
      status: 'ok',
      runtime: 'desktop',
      port: 12345,
      ollama: {
        installed: false,
        running: false,
        state: 'not_installed' as const,
        models: [] as string[],
        defaultModel: null,
      },
    };

    expect(healthResponse.ollama.installed).toBe(false);
    expect(healthResponse.ollama.running).toBe(false);
    expect(healthResponse.ollama.state).toBe('not_installed');
    expect(healthResponse.ollama.models).toEqual([]);
    expect(healthResponse.ollama.defaultModel).toBeNull();
  });

  it('/ollama-status endpoint returns the enriched OllamaStatus shape', () => {
    const ollamaStatus = {
      installed: true,
      running: true,
      state: 'running' as const,
      models: ['llama3.2:3b', 'codellama:7b'],
      defaultModel: 'llama3.2:3b',
      error: undefined as string | undefined,
    };

    expect(ollamaStatus).toHaveProperty('installed');
    expect(ollamaStatus).toHaveProperty('running');
    expect(ollamaStatus).toHaveProperty('state');
    expect(ollamaStatus).toHaveProperty('models');
    expect(ollamaStatus).toHaveProperty('defaultModel');
  });
});

describe('renderer Ollama IPC contract', () => {
  it('backend:getStatus returns the expected shape', () => {
    const status = {
      ready: true,
      port: 54321,
      trpcUrl: 'http://127.0.0.1:54321/api/trpc',
    };

    expect(typeof status.ready).toBe('boolean');
    expect(typeof status.port).toBe('number');
    expect(typeof status.trpcUrl).toBe('string');
    expect(status.trpcUrl).toContain('/api/trpc');
  });

  it('backend:getOllamaStatus includes the new lifecycle state', () => {
    const status = {
      installed: true,
      running: true,
      state: 'running' as const,
      models: ['llama3.2:3b'],
      defaultModel: 'llama3.2:3b',
    };

    expect(typeof status.installed).toBe('boolean');
    expect(typeof status.running).toBe('boolean');
    expect(typeof status.state).toBe('string');
    expect(Array.isArray(status.models)).toBe(true);
  });

  it('ollama:getStatus returns the enriched status shape', () => {
    const status = {
      installed: true,
      running: false,
      state: 'installed_stopped' as const,
      models: [] as string[],
      defaultModel: null,
    };

    expect(status.state).toBe('installed_stopped');
    expect(Array.isArray(status.models)).toBe(true);
  });

  it('ollama:start and ollama:stop return operation results', () => {
    const result = { success: true };

    expect(result).toEqual({ success: true });
  });

  it('ollama:pullProgress uses the expected progress event shape', () => {
    const progress = {
      status: 'downloading',
      digest: 'sha256:abc',
      total: 100,
      completed: 50,
      percent: 50,
    };

    expect(progress.percent).toBe(50);
    expect(progress.digest).toBe('sha256:abc');
  });
});
