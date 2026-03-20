/**
 * PreferencesPanel component tests.
 *
 * Verifies exports, type contracts, and component identity.
 * Full rendering tests require jsdom / @testing-library/react,
 * which will be added in a future phase.
 */

import { describe, it, expect } from 'vitest';
import { PreferencesPanel } from '../PreferencesPanel.js';
import type { PreferencesApi, AvailableModel, ModelSelection } from '../PreferencesPanel.js';

// ---------------------------------------------------------------------------
// Export verification
// ---------------------------------------------------------------------------

describe('PreferencesPanel exports', () => {
  it('exports PreferencesPanel as a function component', () => {
    expect(typeof PreferencesPanel).toBe('function');
    expect(PreferencesPanel.name).toBe('PreferencesPanel');
  });

  it('is re-exported from panels index', async () => {
    const panelsIndex = await import('../index.js');
    expect(panelsIndex.PreferencesPanel).toBe(PreferencesPanel);
  });
});

// ---------------------------------------------------------------------------
// Type contract verification
// ---------------------------------------------------------------------------

describe('PreferencesApi type contract', () => {
  it('PreferencesApi shape supports all required methods', () => {
    const api: PreferencesApi = {
      getApiKeys: async () => [
        { provider: 'anthropic', configured: true, maskedKey: 'sk-ant-...xxxx', createdAt: '2026-03-20T00:00:00Z' },
        { provider: 'openai', configured: false, maskedKey: null, createdAt: null },
      ],
      setApiKey: async () => ({ stored: true }),
      deleteApiKey: async () => ({ deleted: true }),
      testApiKey: async () => ({ valid: true, error: null }),
      getSystemStatus: async () => ({
        ollama: { running: true, models: ['llama3.2:3b'] },
        configuredProviders: ['anthropic'],
        credentialVaultHealthy: true,
      }),
    };

    expect(typeof api.getApiKeys).toBe('function');
    expect(typeof api.setApiKey).toBe('function');
    expect(typeof api.deleteApiKey).toBe('function');
    expect(typeof api.testApiKey).toBe('function');
    expect(typeof api.getSystemStatus).toBe('function');
  });

  it('getApiKeys returns correct shape', async () => {
    const api: PreferencesApi = {
      getApiKeys: async () => [
        { provider: 'anthropic', configured: true, maskedKey: 'sk-ant-...xxxx', createdAt: '2026-03-20T00:00:00Z' },
        { provider: 'openai', configured: false, maskedKey: null, createdAt: null },
      ],
      setApiKey: async () => ({ stored: true }),
      deleteApiKey: async () => ({ deleted: true }),
      testApiKey: async () => ({ valid: true, error: null }),
      getSystemStatus: async () => ({
        ollama: { running: false, models: [] },
        configuredProviders: [],
        credentialVaultHealthy: true,
      }),
    };

    const keys = await api.getApiKeys();
    expect(keys).toHaveLength(2);
    expect(keys[0]!.provider).toBe('anthropic');
    expect(keys[0]!.configured).toBe(true);
    expect(keys[0]!.maskedKey).toBe('sk-ant-...xxxx');
    expect(keys[1]!.provider).toBe('openai');
    expect(keys[1]!.configured).toBe(false);
    expect(keys[1]!.maskedKey).toBeNull();
  });

  it('setApiKey accepts provider and key', async () => {
    let capturedInput: { provider: string; key: string } | null = null;

    const api: PreferencesApi = {
      getApiKeys: async () => [],
      setApiKey: async (input) => {
        capturedInput = input;
        return { stored: true };
      },
      deleteApiKey: async () => ({ deleted: true }),
      testApiKey: async () => ({ valid: true, error: null }),
      getSystemStatus: async () => ({
        ollama: { running: false, models: [] },
        configuredProviders: [],
        credentialVaultHealthy: true,
      }),
    };

    await api.setApiKey({ provider: 'anthropic', key: 'sk-ant-test-key' });
    expect(capturedInput).toEqual({ provider: 'anthropic', key: 'sk-ant-test-key' });
  });

  it('testApiKey returns valid/invalid results', async () => {
    const api: PreferencesApi = {
      getApiKeys: async () => [],
      setApiKey: async () => ({ stored: true }),
      deleteApiKey: async () => ({ deleted: true }),
      testApiKey: async ({ provider }) => {
        if (provider === 'anthropic') return { valid: true, error: null };
        return { valid: false, error: 'Invalid API key' };
      },
      getSystemStatus: async () => ({
        ollama: { running: false, models: [] },
        configuredProviders: [],
        credentialVaultHealthy: true,
      }),
    };

    const validResult = await api.testApiKey({ provider: 'anthropic', key: 'key' });
    expect(validResult.valid).toBe(true);
    expect(validResult.error).toBeNull();

    const invalidResult = await api.testApiKey({ provider: 'openai', key: 'bad-key' });
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.error).toBe('Invalid API key');
  });

  it('getSystemStatus returns correct shape', async () => {
    const api: PreferencesApi = {
      getApiKeys: async () => [],
      setApiKey: async () => ({ stored: true }),
      deleteApiKey: async () => ({ deleted: true }),
      testApiKey: async () => ({ valid: true, error: null }),
      getSystemStatus: async () => ({
        ollama: { running: true, models: ['llama3.2:3b', 'codellama:7b'] },
        configuredProviders: ['anthropic', 'openai'],
        credentialVaultHealthy: true,
      }),
    };

    const status = await api.getSystemStatus();
    expect(status.ollama.running).toBe(true);
    expect(status.ollama.models).toHaveLength(2);
    expect(status.configuredProviders).toContain('anthropic');
    expect(status.configuredProviders).toContain('openai');
    expect(status.credentialVaultHealthy).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Model selector API contract verification
// ---------------------------------------------------------------------------

describe('Model selector API contract', () => {
  function createFullApi(): PreferencesApi {
    return {
      getApiKeys: async () => [],
      setApiKey: async () => ({ stored: true }),
      deleteApiKey: async () => ({ deleted: true }),
      testApiKey: async () => ({ valid: true, error: null }),
      getSystemStatus: async () => ({
        ollama: { running: false, models: [] },
        configuredProviders: [],
        credentialVaultHealthy: true,
      }),
      getAvailableModels: async () => ({
        models: [
          { id: 'ollama:llama3.2:3b', name: 'llama3.2:3b', provider: 'ollama', available: true },
          { id: 'anthropic:claude-opus-4-20250514', name: 'Claude Opus 4', provider: 'anthropic', available: true },
          { id: 'openai:gpt-4o', name: 'GPT-4o', provider: 'openai', available: true },
        ],
      }),
      getModelSelection: async () => ({
        principal: 'anthropic:claude-opus-4-20250514',
        system: 'anthropic:claude-sonnet-4-20250514',
      }),
      setModelSelection: async () => ({ success: true }),
    };
  }

  it('PreferencesApi shape supports optional model selector methods', () => {
    const api = createFullApi();
    expect(typeof api.getAvailableModels).toBe('function');
    expect(typeof api.getModelSelection).toBe('function');
    expect(typeof api.setModelSelection).toBe('function');
  });

  it('getAvailableModels returns models grouped by provider', async () => {
    const api = createFullApi();
    const result = await api.getAvailableModels!();
    expect(result.models).toHaveLength(3);

    const providers = new Set(result.models.map((m: AvailableModel) => m.provider));
    expect(providers.has('ollama')).toBe(true);
    expect(providers.has('anthropic')).toBe(true);
    expect(providers.has('openai')).toBe(true);
  });

  it('getModelSelection returns principal and system roles', async () => {
    const api = createFullApi();
    const selection = await api.getModelSelection!();
    expect(selection.principal).toBe('anthropic:claude-opus-4-20250514');
    expect(selection.system).toBe('anthropic:claude-sonnet-4-20250514');
  });

  it('getModelSelection returns null when nothing saved', async () => {
    const api: PreferencesApi = {
      ...createFullApi(),
      getModelSelection: async () => ({ principal: null, system: null }),
    };

    const selection = await api.getModelSelection!();
    expect(selection.principal).toBeNull();
    expect(selection.system).toBeNull();
  });

  it('setModelSelection accepts partial input', async () => {
    let captured: { principal?: string; system?: string } | null = null;
    const api: PreferencesApi = {
      ...createFullApi(),
      setModelSelection: async (input) => {
        captured = input;
        return { success: true };
      },
    };

    await api.setModelSelection!({ principal: 'openai:o3' });
    expect(captured).toEqual({ principal: 'openai:o3' });
  });

  it('model IDs follow provider:model-name format', async () => {
    const api = createFullApi();
    const result = await api.getAvailableModels!();

    for (const model of result.models) {
      expect(model.id).toMatch(/^[a-z]+:.+/);
      expect(model.id.startsWith(model.provider + ':')).toBe(true);
    }
  });

  it('AvailableModel and ModelSelection types are structurally sound', () => {
    const model: AvailableModel = {
      id: 'ollama:llama3.2:3b',
      name: 'llama3.2:3b',
      provider: 'ollama',
      available: true,
    };
    expect(model.id).toBeTruthy();
    expect(typeof model.available).toBe('boolean');

    const selection: ModelSelection = {
      principal: 'anthropic:claude-opus-4-20250514',
      system: null,
    };
    expect(selection.principal).toBeTruthy();
    expect(selection.system).toBeNull();
  });

  it('is re-exported from panels index', async () => {
    const panelsIndex = await import('../index.js');
    expect(panelsIndex.PreferencesPanel).toBe(PreferencesPanel);
  });
});
