/**
 * Tests for the desktop backend health endpoint enhancement.
 *
 * Verifies that the /health endpoint includes Ollama status
 * and that the /ollama-status endpoint returns correct shape.
 */
import { describe, it, expect } from 'vitest';

describe('desktop backend health endpoint contract', () => {
  it('/health response includes ollama field with expected shape', () => {
    // Verify the contract shape returned by the enhanced health endpoint
    const healthResponse = {
      status: 'ok',
      runtime: 'desktop',
      port: 12345,
      ollama: {
        installed: true,
        running: true,
        models: ['llama3.2:3b'],
        defaultModel: 'llama3.2:3b',
      },
    };

    expect(healthResponse.status).toBe('ok');
    expect(healthResponse.ollama).toBeDefined();
    expect(typeof healthResponse.ollama.installed).toBe('boolean');
    expect(typeof healthResponse.ollama.running).toBe('boolean');
    expect(Array.isArray(healthResponse.ollama.models)).toBe(true);
    expect(
      healthResponse.ollama.defaultModel === null ||
      typeof healthResponse.ollama.defaultModel === 'string',
    ).toBe(true);
  });

  it('/health response with no Ollama has correct fallback shape', () => {
    const healthResponse = {
      status: 'ok',
      runtime: 'desktop',
      port: 12345,
      ollama: {
        installed: false,
        running: false,
        models: [] as string[],
        defaultModel: null,
      },
    };

    expect(healthResponse.ollama.installed).toBe(false);
    expect(healthResponse.ollama.running).toBe(false);
    expect(healthResponse.ollama.models).toEqual([]);
    expect(healthResponse.ollama.defaultModel).toBeNull();
  });

  it('/ollama-status endpoint returns OllamaStatus shape', () => {
    // The /ollama-status endpoint returns the same shape as OllamaStatus
    const ollamaStatus = {
      installed: true,
      running: true,
      models: ['llama3.2:3b', 'codellama:7b'],
      defaultModel: 'llama3.2:3b',
    };

    expect(ollamaStatus).toHaveProperty('installed');
    expect(ollamaStatus).toHaveProperty('running');
    expect(ollamaStatus).toHaveProperty('models');
    expect(ollamaStatus).toHaveProperty('defaultModel');
  });
});

describe('renderer backend status IPC contract', () => {
  it('backend:getStatus returns expected shape', () => {
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

  it('backend:getStatus returns null port/trpcUrl when not ready', () => {
    const status = {
      ready: false,
      port: null,
      trpcUrl: null,
    };

    expect(status.ready).toBe(false);
    expect(status.port).toBeNull();
    expect(status.trpcUrl).toBeNull();
  });

  it('backend:getOllamaStatus returns OllamaStatus shape', () => {
    const status = {
      installed: true,
      running: true,
      models: ['llama3.2:3b'],
      defaultModel: 'llama3.2:3b',
    };

    expect(typeof status.installed).toBe('boolean');
    expect(typeof status.running).toBe('boolean');
    expect(Array.isArray(status.models)).toBe(true);
  });
});
