import { describe, it, expect, vi } from 'vitest';
import {
  PreferencesPanel,
  formatFeedbackError,
  testStoredProviderKey,
} from '../PreferencesPanel.js';
import type {
  PreferencesApi,
  AvailableModel,
  ModelSelection,
  RoleAssignmentDisplayEntry,
} from '../PreferencesPanel.js';

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
  }, 15000);
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

    const validResult = await api.testApiKey({ provider: 'anthropic' });
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

describe('stored provider key testing helpers', () => {
  function createBaseApi(overrides: Partial<PreferencesApi> = {}): PreferencesApi {
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
      ...overrides,
    };
  }

  it('calls testApiKey with provider only to use vault fallback', async () => {
    const testApiKey = vi.fn(async () => ({ valid: true, error: null }));
    const api = createBaseApi({ testApiKey });

    await testStoredProviderKey(api, 'anthropic');

    expect(testApiKey).toHaveBeenCalledWith({ provider: 'anthropic' });
  });

  it('returns success feedback when the stored key validates', async () => {
    const api = createBaseApi({
      testApiKey: async () => ({ valid: true, error: null }),
    });

    await expect(testStoredProviderKey(api, 'openai')).resolves.toEqual({
      message: 'OpenAI API key is valid.',
      success: true,
    });
  });

  it('returns the server error when stored-key validation fails', async () => {
    const api = createBaseApi({
      testApiKey: async () => ({
        valid: false,
        error: 'No API key configured for this provider. Store a key first.',
      }),
    });

    await expect(testStoredProviderKey(api, 'anthropic')).resolves.toEqual({
      message: 'No API key configured for this provider. Store a key first.',
      success: false,
    });
  });

  it('formats thrown errors into user-facing feedback', () => {
    expect(formatFeedbackError(new Error('Network offline'))).toEqual({
      message: 'Error: Network offline',
      success: false,
    });
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
      getRoleAssignments: async () => ([
        {
          role: 'orchestrator',
          providerId: '10000000-0000-0000-0000-000000000003',
        },
      ]),
      setRoleAssignment: async () => ({ success: true }),
    };
  }

  it('PreferencesApi shape supports optional model selector methods', () => {
    const api = createFullApi();
    expect(typeof api.getAvailableModels).toBe('function');
    expect(typeof api.getModelSelection).toBe('function');
    expect(typeof api.setModelSelection).toBe('function');
    expect(typeof api.getRoleAssignments).toBe('function');
    expect(typeof api.setRoleAssignment).toBe('function');
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

    const roleAssignment: RoleAssignmentDisplayEntry = {
      role: 'orchestrator',
      providerId: '10000000-0000-0000-0000-000000000003',
    };
    expect(roleAssignment.role).toBe('orchestrator');
    expect(roleAssignment.providerId).toBeTruthy();
  });

  it('getRoleAssignments returns role assignment display entries', async () => {
    const api = createFullApi();
    const assignments = await api.getRoleAssignments!();

    expect(assignments).toEqual([
      {
        role: 'orchestrator',
        providerId: '10000000-0000-0000-0000-000000000003',
      },
    ]);
  });

  it('setRoleAssignment accepts a role and modelSpec', async () => {
    let captured: { role: string; modelSpec: string } | null = null;
    const api: PreferencesApi = {
      ...createFullApi(),
      setRoleAssignment: async (input) => {
        captured = input;
        return { success: true };
      },
    };

    await api.setRoleAssignment!({
      role: 'vision',
      modelSpec: 'openai:gpt-4o',
    });

    expect(captured).toEqual({
      role: 'vision',
      modelSpec: 'openai:gpt-4o',
    });
  });

  it('is re-exported from panels index', async () => {
    const panelsIndex = await import('../index.js');
    expect(panelsIndex.PreferencesPanel).toBe(PreferencesPanel);
  }, 15000);
});

// ---------------------------------------------------------------------------
// Settings module exports
// ---------------------------------------------------------------------------

describe('Settings module exports', () => {
  it('SettingsShell is exported as a function component from panels index', async () => {
    const panelsIndex = await import('../index.js');
    expect(typeof panelsIndex.SettingsShell).toBe('function');
    expect(panelsIndex.SettingsShell.name).toBe('SettingsShell');
  }, 15000);

  it('settings types are importable from panels index', async () => {
    const panelsIndex = await import('../index.js');
    // These are type exports — they exist as undefined at runtime but the import should not throw
    // We verify the module loaded without errors and the value exports are present
    expect(panelsIndex.SettingsShell).toBeDefined();
    expect(panelsIndex.PreferencesPanel).toBeDefined();
  }, 15000);

  it('testStoredProviderKey and formatFeedbackError are re-exported from panels index', async () => {
    const panelsIndex = await import('../index.js');
    expect(typeof panelsIndex.testStoredProviderKey).toBe('function');
    expect(typeof panelsIndex.formatFeedbackError).toBe('function');
  }, 15000);

  it('PreferencesPanel identity matches between direct import and panels index', async () => {
    const panelsIndex = await import('../index.js');
    expect(panelsIndex.PreferencesPanel).toBe(PreferencesPanel);
  }, 15000);

  it('SettingsShellProps type contract verifies expected fields', () => {
    // This is a compile-time test — if the type is wrong, TypeScript will error
    type SettingsShellPropsFromIndex = import('../index.js').SettingsShellProps;
    const props: SettingsShellPropsFromIndex = {
      api: undefined,
      appPanels: [{ id: 'test', title: 'Test' }],
      defaultPageId: 'about',
      currentMode: 'simple',
      onModeChange: () => {},
      onWizardReset: () => {},
    };
    expect(props.defaultPageId).toBe('about');
    expect(props.appPanels).toHaveLength(1);
  });
});
