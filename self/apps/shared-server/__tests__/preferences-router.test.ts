import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ModelRoleSchema } from '@nous/shared';

const SYSTEM_APP_ID = 'nous:system';
const MODEL_ROLES = ModelRoleSchema.options;
const CODEX_CLI_DEFAULT_MODEL = {
  id: 'codex-cli:codex-cli/default',
  name: 'Codex CLI (default)',
  provider: 'codex-cli',
  providerLabel: 'Codex CLI',
  available: true,
  authKind: 'local_session',
  availabilityReason: 'Uses the local Codex CLI login session; run `codex login` outside Nous.',
  executionCapabilityProfile: 'session_bound_command',
  roleCompatibility: {
    'cortex-chat': expect.objectContaining({ selectable: false }),
    'cortex-system': expect.objectContaining({ selectable: false }),
    orchestrators: expect.objectContaining({ selectable: true }),
    workers: expect.objectContaining({ selectable: true }),
  },
};
const providerDefinitionsMock = vi.hoisted(() => ({
  PROVIDER_DEFINITIONS: [
    {
      vendorKey: 'anthropic',
      displayName: 'Anthropic',
      wellKnownProviderId: '10000000-0000-0000-0000-000000000001',
      providerType: 'text',
      providerClass: 'remote_text',
      protocol: 'anthropic-messages',
      adapterKey: 'anthropic',
      defaultEndpoint: 'https://api.anthropic.com',
      defaultModelId: 'claude-sonnet-4-20250514',
      auth: {
        envVar: 'ANTHROPIC_API_KEY',
        vaultKeyNamespace: 'anthropic',
        header: {
          name: 'x-api-key',
          scheme: 'raw',
        },
        required: true,
        purpose: 'api_key',
      },
      headers: {
        'anthropic-version': '2023-06-01',
      },
      modelListEndpoint: '/v1/models',
      modelListFormat: 'anthropic-models',
      capabilities: { streaming: true, modelListing: true },
      isLocal: false,
    },
    {
      vendorKey: 'codex-cli',
      displayName: 'Codex CLI',
      wellKnownProviderId: '10000000-0000-0000-0000-000000000004',
      providerType: 'text',
      providerClass: 'local_text',
      protocol: 'agent-cli',
      adapterKey: 'codex-cli',
      defaultEndpoint: 'http://localhost',
      defaultModelId: 'codex-cli/default',
      auth: {
        required: false,
        purpose: 'api_key',
      },
      capabilities: { streaming: false },
      executionCapabilityProfile: 'session_bound_command',
      isLocal: true,
      agentCli: {
        install: {
          command: 'npm install -g @openai/codex',
          packageName: '@openai/codex',
          versionCommand: 'codex --version',
          minimumVersion: '0.137.0',
          notes: 'Codex CLI must be installed and authenticated locally before use.',
        },
        auth: {
          kind: 'local_session',
          description: 'Uses the local Codex CLI login session; run `codex login` outside Nous.',
        },
      },
    },
    {
      vendorKey: 'ollama',
      displayName: 'Ollama',
      wellKnownProviderId: '10000000-0000-0000-0000-000000000003',
      providerType: 'text',
      providerClass: 'local_text',
      protocol: 'ollama',
      adapterKey: 'ollama',
      defaultEndpoint: 'http://localhost:11434',
      defaultModelId: 'llama3',
      auth: {
        required: false,
        purpose: 'api_key',
      },
      modelListEndpoint: '/v1/models',
      modelListFormat: 'openai-models',
      healthCheckEndpoint: '/api/tags',
      capabilities: { streaming: true, modelListing: true },
      isLocal: true,
    },
    {
      vendorKey: 'openai',
      displayName: 'OpenAI',
      wellKnownProviderId: '10000000-0000-0000-0000-000000000002',
      providerType: 'text',
      providerClass: 'remote_text',
      protocol: 'chat-completions',
      adapterKey: 'chat-completions',
      defaultEndpoint: 'https://api.openai.com',
      defaultModelId: 'gpt-4o',
      auth: {
        envVar: 'OPENAI_API_KEY',
        vaultKeyNamespace: 'openai',
        header: {
          name: 'Authorization',
          scheme: 'bearer',
        },
        required: true,
        purpose: 'api_key',
      },
      modelListEndpoint: '/v1/models',
      modelListFormat: 'openai-models',
      capabilities: { streaming: true, modelListing: true },
      isLocal: false,
    },
    {
      vendorKey: 'fixture',
      displayName: 'Fixture AI',
      wellKnownProviderId: '10000000-0000-0000-0000-000000000005',
      providerType: 'text',
      providerClass: 'remote_text',
      protocol: 'chat-completions',
      adapterKey: 'chat-completions',
      defaultEndpoint: 'https://fixture.example.com',
      defaultModelId: 'fixture-default',
      auth: {
        envVar: 'FIXTURE_API_KEY',
        vaultKeyNamespace: 'fixture',
        header: {
          name: 'X-Fixture-Key',
          scheme: 'raw',
        },
        required: true,
        purpose: 'api_key',
      },
      modelListEndpoint: '/v1/models',
      modelListFormat: 'openai-models',
      healthCheckEndpoint: '/health',
      capabilities: { streaming: true, modelListing: true },
      isLocal: false,
    },
  ],
}));

const detectOllamaMock = vi.hoisted(() => vi.fn());
const bootstrapConstants = vi.hoisted(() => ({
  WELL_KNOWN_PROVIDER_IDS: {
    anthropic: '10000000-0000-0000-0000-000000000001',
    openai: '10000000-0000-0000-0000-000000000002',
    ollama: '10000000-0000-0000-0000-000000000003',
    'codex-cli': '10000000-0000-0000-0000-000000000004',
  },
  OLLAMA_WELL_KNOWN_PROVIDER_ID: '10000000-0000-0000-0000-000000000003',
}));
const bootstrapMock = vi.hoisted(() => ({
  buildOllamaProviderConfig: vi.fn(),
  buildProviderConfig: vi.fn(),
  currentProviderEntries: vi.fn().mockReturnValue([]),
  currentRoleAssignment: vi.fn(),
  parseSelectedModelSpec: vi.fn(),
  registerConfiguredProvider: vi.fn(),
  removeConfiguredProvider: vi.fn(),
  updateRoleAssignment: vi.fn(),
  upsertProviderConfig: vi.fn(),
}));

vi.mock('../src/ollama-detection', () => ({
  detectOllama: detectOllamaMock,
}));

vi.mock('../src/bootstrap', () => ({
  OLLAMA_WELL_KNOWN_PROVIDER_ID: bootstrapConstants.OLLAMA_WELL_KNOWN_PROVIDER_ID,
  WELL_KNOWN_PROVIDER_IDS: bootstrapConstants.WELL_KNOWN_PROVIDER_IDS,
  buildOllamaProviderConfig: bootstrapMock.buildOllamaProviderConfig,
  buildProviderConfig: bootstrapMock.buildProviderConfig,
  currentProviderEntries: bootstrapMock.currentProviderEntries,
  currentRoleAssignment: bootstrapMock.currentRoleAssignment,
  parseSelectedModelSpec: bootstrapMock.parseSelectedModelSpec,
  registerConfiguredProvider: bootstrapMock.registerConfiguredProvider,
  removeConfiguredProvider: bootstrapMock.removeConfiguredProvider,
  updateRoleAssignment: bootstrapMock.updateRoleAssignment,
  upsertProviderConfig: bootstrapMock.upsertProviderConfig,
}));

vi.mock('@nous/subcortex-providers', () => providerDefinitionsMock);

function vaultKey(provider: string): string {
  return `api_key_${provider}`;
}

function parseSelectedModelSpecMock(
  spec: string | null | undefined,
): { provider: 'anthropic' | 'openai' | 'ollama' | 'codex-cli'; modelId: string } | null {
  if (!spec) {
    return null;
  }

  const [provider, ...modelParts] = spec.split(':');
  const modelId = modelParts.join(':');
  if (
    (provider !== 'anthropic' &&
      provider !== 'openai' &&
      provider !== 'ollama' &&
      provider !== 'codex-cli') ||
    modelId.length === 0
  ) {
    return null;
  }

  return {
    provider,
    modelId,
  };
}

function buildProviderConfigMock(
  provider: 'anthropic' | 'openai' | 'codex-cli',
  providerId = bootstrapConstants.WELL_KNOWN_PROVIDER_IDS[provider],
  modelId = provider === 'anthropic'
    ? 'claude-sonnet-4-20250514'
    : provider === 'codex-cli'
      ? 'codex-cli/default'
      : 'gpt-4o',
) {
  return {
    id: providerId,
    name: provider,
    type: 'text' as const,
    endpoint:
      provider === 'anthropic'
        ? 'https://api.anthropic.com'
        : provider === 'codex-cli'
          ? 'http://localhost'
          : 'https://api.openai.com',
    modelId,
    isLocal: provider === 'codex-cli',
    capabilities: provider === 'codex-cli' ? ['chat'] : ['chat', 'streaming'],
    providerClass: provider === 'codex-cli' ? 'local_text' as const : 'remote_text' as const,
  };
}

function buildOllamaProviderConfigMock(
  modelId: string,
  providerId = bootstrapConstants.OLLAMA_WELL_KNOWN_PROVIDER_ID,
) {
  return {
    id: providerId,
    name: 'ollama',
    type: 'text' as const,
    endpoint: 'http://localhost:11434',
    modelId,
    isLocal: true,
    capabilities: ['chat', 'streaming'],
    providerClass: 'local_text' as const,
  };
}

function createMockVault() {
  const entries = new Map<string, { value: string; metadata: Record<string, unknown> }>();

  return {
    store: async (
      appId: string,
      request: {
        key: string;
        value: string;
        credential_type: string;
        target_host: string;
        injection_location: string;
        injection_key: string;
      },
    ) => {
      const entryKey = `${appId}:${request.key}`;
      const metadata = {
        app_id: appId,
        user_key: request.key,
        credential_type: request.credential_type,
        target_host: request.target_host,
        injection_location: request.injection_location,
        injection_key: request.injection_key,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      entries.set(entryKey, {
        value: request.value,
        metadata,
      });

      return {
        credential_ref: `credential:${entryKey}`,
        metadata,
      };
    },
    getMetadata: async (appId: string, key: string) => {
      return entries.get(`${appId}:${key}`)?.metadata ?? null;
    },
    revoke: async (appId: string, request: { key: string; reason: string }) => {
      return { revoked: entries.delete(`${appId}:${request.key}`) };
    },
    resolveForInjection: async (appId: string, key: string) => {
      const entry = entries.get(`${appId}:${key}`);
      if (!entry) {
        return null;
      }

      return {
        metadata: entry.metadata,
        secretValue: entry.value,
      };
    },
  };
}

function createMockDocumentStore() {
  const documents = new Map<string, unknown>();

  return {
    put: async <T>(collection: string, id: string, document: T) => {
      documents.set(`${collection}:${id}`, document);
    },
    get: async <T>(collection: string, id: string): Promise<T | null> => {
      return (documents.get(`${collection}:${id}`) as T) ?? null;
    },
    query: async () => [],
    delete: async (collection: string, id: string) => {
      return documents.delete(`${collection}:${id}`);
    },
  };
}

function createMockContext() {
  const credentialVaultService = createMockVault();
  const documentStore = createMockDocumentStore();

  return {
    credentialVaultService,
    documentStore,
    ctx: {
      credentialVaultService,
      documentStore,
      config: {
        get: vi.fn(() => ({ providers: [] })),
        update: vi.fn(),
      },
      providerRegistry: {
        registerProvider: vi.fn(),
        removeProvider: vi.fn(),
      },
    } as any,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

async function loadPreferencesRouter() {
  return (await import('../src/trpc/routers/preferences')).preferencesRouter;
}

describe('preferences router', () => {
  const originalFetch = globalThis.fetch;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.resetModules();
    vi.useRealTimers();

    savedEnv.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    savedEnv.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;

    detectOllamaMock.mockReset();
    detectOllamaMock.mockResolvedValue({
      installed: false,
      running: false,
      state: 'not_installed',
      models: [],
      defaultModel: null,
    });

    bootstrapMock.buildOllamaProviderConfig.mockReset();
    bootstrapMock.buildOllamaProviderConfig.mockImplementation(
      buildOllamaProviderConfigMock,
    );
    bootstrapMock.buildProviderConfig.mockReset();
    bootstrapMock.buildProviderConfig.mockImplementation(buildProviderConfigMock);
    bootstrapMock.currentProviderEntries.mockReset();
    bootstrapMock.currentProviderEntries.mockReturnValue([]);
    bootstrapMock.currentRoleAssignment.mockReset();
    bootstrapMock.currentRoleAssignment.mockReturnValue(undefined);
    bootstrapMock.parseSelectedModelSpec.mockReset();
    bootstrapMock.parseSelectedModelSpec.mockImplementation(parseSelectedModelSpecMock);
    bootstrapMock.registerConfiguredProvider.mockReset();
    bootstrapMock.registerConfiguredProvider.mockResolvedValue(undefined);
    bootstrapMock.removeConfiguredProvider.mockReset();
    bootstrapMock.removeConfiguredProvider.mockResolvedValue(undefined);
    bootstrapMock.updateRoleAssignment.mockReset();
    bootstrapMock.updateRoleAssignment.mockResolvedValue(undefined);
    bootstrapMock.upsertProviderConfig.mockReset();
    bootstrapMock.upsertProviderConfig.mockResolvedValue(undefined);

    globalThis.fetch = vi.fn() as typeof fetch;

    vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;

    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  describe('API key flows', () => {
    it('stores a key, masks it on read, and registers the provider', async () => {
      const { ctx } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);

      const result = await caller.setApiKey({
        provider: 'anthropic',
        key: 'sk-ant-api03-test-value-1234',
      });
      const apiKeys = await caller.getApiKeys();

      expect(result).toEqual({ stored: true });
      expect(process.env.ANTHROPIC_API_KEY).toBe('sk-ant-api03-test-value-1234');
      expect(bootstrapMock.registerConfiguredProvider).toHaveBeenCalledWith(
        ctx,
        'anthropic',
      );
      expect(apiKeys).toContainEqual(
        expect.objectContaining({
          provider: 'anthropic',
          displayName: 'Anthropic',
          configured: true,
          maskedKey: 'sk-ant-...1234',
        }),
      );
    }, 10000);

    it('deletes a key, clears env state, and removes the provider', async () => {
      const { ctx } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);

      await caller.setApiKey({
        provider: 'openai',
        key: 'sk-proj-delete-me',
      });

      const result = await caller.deleteApiKey({
        provider: 'openai',
      });
      const apiKeys = await caller.getApiKeys();

      expect(result).toEqual({ deleted: true });
      expect(process.env.OPENAI_API_KEY).toBeUndefined();
      expect(bootstrapMock.removeConfiguredProvider).toHaveBeenCalledWith(
        ctx,
        'openai',
      );
      expect(apiKeys).toContainEqual(
        expect.objectContaining({
          provider: 'openai',
          displayName: 'OpenAI',
          configured: false,
          maskedKey: null,
        }),
      );
    });

    it('tests fixture API keys through health-check endpoint metadata', async () => {
      const { ctx } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);
      const fetchMock = vi.mocked(globalThis.fetch);

      fetchMock.mockImplementationOnce(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          expect(input).toBe('https://fixture.example.com/health');
          expect(init).toMatchObject({
            method: 'GET',
            headers: {
              'X-Fixture-Key': 'fixture-key',
            },
          });
          return jsonResponse({ ok: true });
        },
      );

      const result = await caller.testApiKey({
        provider: 'fixture' as never,
        key: 'fixture-key',
      });

      expect(result).toEqual({ valid: true, error: null });
    });

    it('keeps Codex CLI out of API-key credential rows', async () => {
      const { ctx } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);

      const apiKeys = await caller.getApiKeys();

      expect(apiKeys.map((entry) => entry.provider)).toEqual([
        'anthropic',
        'openai',
        'fixture',
      ]);
      expect(apiKeys).toContainEqual(
        expect.objectContaining({
          provider: 'fixture',
          displayName: 'Fixture AI',
          configured: false,
        }),
      );
    });
  });

  describe('getSystemStatus', () => {
    it('returns provider connection rows for API-key, Ollama, and Codex CLI providers', async () => {
      const { ctx, credentialVaultService } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);
      const fetchMock = vi.mocked(globalThis.fetch);

      detectOllamaMock.mockResolvedValueOnce({
        installed: true,
        running: true,
        state: 'running',
        models: ['llama3.2:3b'],
        defaultModel: 'llama3.2:3b',
      });

      await credentialVaultService.store(SYSTEM_APP_ID, {
        key: vaultKey('anthropic'),
        value: 'sk-ant-status',
        credential_type: 'api_key',
        target_host: 'api.anthropic.com',
        injection_location: 'header',
        injection_key: 'x-api-key',
      });

      const result = await caller.getSystemStatus();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.ollama).toEqual({
        running: true,
        models: ['llama3.2:3b'],
      });
      expect(result.configuredProviders).toEqual(['anthropic']);
      expect(result.providerConnections).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            provider: 'anthropic',
            displayName: 'Anthropic',
            authKind: 'api_key',
            configured: true,
            selectable: true,
            status: 'ready',
          }),
          expect.objectContaining({
            provider: 'openai',
            displayName: 'OpenAI',
            authKind: 'api_key',
            configured: false,
            selectable: false,
            status: 'missing_credentials',
          }),
          expect.objectContaining({
            provider: 'ollama',
            displayName: 'Ollama',
            authKind: 'none',
            configured: true,
            selectable: true,
            status: 'ready',
          }),
          expect.objectContaining({
            provider: 'codex-cli',
            displayName: 'Codex CLI',
            authKind: 'local_session',
            configured: false,
            selectable: true,
            status: 'not_checked',
            message: 'Uses the local Codex CLI login session; run `codex login` outside Nous.',
            setupCommand: 'npm install -g @openai/codex',
            versionCommand: 'codex --version',
          }),
        ]),
      );
    });

    it('reports Ollama not running without disabling Codex CLI selection metadata', async () => {
      const { ctx } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);

      detectOllamaMock.mockResolvedValueOnce({
        installed: false,
        running: false,
        state: 'not_installed',
        models: [],
        defaultModel: null,
      });

      const result = await caller.getSystemStatus();

      expect(result.configuredProviders).toEqual([]);
      expect(result.providerConnections).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            provider: 'ollama',
            configured: false,
            selectable: false,
            status: 'not_running',
          }),
          expect.objectContaining({
            provider: 'codex-cli',
            configured: false,
            selectable: true,
            status: 'not_checked',
          }),
        ]),
      );
    });
  });

  describe('getRoleAssignments', () => {
    it('returns all model roles with null when no assignments exist', async () => {
      const { ctx } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);

      const result = await caller.getRoleAssignments();

      expect(result).toEqual(
        Object.fromEntries(MODEL_ROLES.map((role) => [role, null])),
      );
      expect(bootstrapMock.currentRoleAssignment).toHaveBeenCalledTimes(
        MODEL_ROLES.length,
      );
    });

    it('returns configured roles alongside unassigned roles', async () => {
      const { ctx } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);

      bootstrapMock.currentRoleAssignment.mockImplementation(
        (_ctx: unknown, role: ModelRole) => {
          if (role === 'orchestrators') {
            return {
              role,
              providerId: bootstrapConstants.OLLAMA_WELL_KNOWN_PROVIDER_ID,
            };
          }

          if (role === 'cortex-chat') {
            return {
              role,
              providerId: bootstrapConstants.WELL_KNOWN_PROVIDER_IDS.openai,
              fallbackProviderId: bootstrapConstants.WELL_KNOWN_PROVIDER_IDS.anthropic,
            };
          }

          return undefined;
        },
      );

      const result = await caller.getRoleAssignments();

      expect(result).toEqual({
        orchestrators: {
          providerId: bootstrapConstants.OLLAMA_WELL_KNOWN_PROVIDER_ID,
          modelSpec: null,
        },
        'cortex-chat': {
          providerId: bootstrapConstants.WELL_KNOWN_PROVIDER_IDS.openai,
          fallbackProviderId: bootstrapConstants.WELL_KNOWN_PROVIDER_IDS.anthropic,
          modelSpec: null,
        },
        'cortex-system': null,
        workers: null,
      });
    });

    it('returns modelSpec when provider config entries exist', async () => {
      const { ctx } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);

      bootstrapMock.currentRoleAssignment.mockImplementation(
        (_ctx: unknown, role: string) => {
          if (role === 'orchestrators') {
            return {
              role,
              providerId: bootstrapConstants.WELL_KNOWN_PROVIDER_IDS.anthropic,
            };
          }
          if (role === 'cortex-chat') {
            return {
              role,
              providerId: bootstrapConstants.OLLAMA_WELL_KNOWN_PROVIDER_ID,
            };
          }
          return undefined;
        },
      );

      bootstrapMock.currentProviderEntries.mockReturnValue([
        {
          id: bootstrapConstants.WELL_KNOWN_PROVIDER_IDS.anthropic,
          name: 'anthropic',
          modelId: 'claude-sonnet-4-20250514',
        },
        {
          id: bootstrapConstants.OLLAMA_WELL_KNOWN_PROVIDER_ID,
          name: 'ollama',
          modelId: 'llama3',
        },
      ]);

      const result = await caller.getRoleAssignments();

      expect(result).toEqual({
        orchestrators: {
          providerId: bootstrapConstants.WELL_KNOWN_PROVIDER_IDS.anthropic,
          modelSpec: 'anthropic:claude-sonnet-4-20250514',
        },
        'cortex-chat': {
          providerId: bootstrapConstants.OLLAMA_WELL_KNOWN_PROVIDER_ID,
          modelSpec: 'ollama:llama3',
        },
        'cortex-system': null,
        workers: null,
      });
    });

    it('returns modelSpec null when provider config entry not found (orphaned)', async () => {
      const { ctx } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);

      bootstrapMock.currentRoleAssignment.mockImplementation(
        (_ctx: unknown, role: string) => {
          if (role === 'orchestrators') {
            return {
              role,
              providerId: '99999999-0000-0000-0000-000000000099',
            };
          }
          return undefined;
        },
      );

      bootstrapMock.currentProviderEntries.mockReturnValue([
        {
          id: bootstrapConstants.WELL_KNOWN_PROVIDER_IDS.anthropic,
          name: 'anthropic',
          modelId: 'claude-sonnet-4-20250514',
        },
      ]);

      const result = await caller.getRoleAssignments();

      expect(result.orchestrators).toEqual({
        providerId: '99999999-0000-0000-0000-000000000099',
        modelSpec: null,
      });
      expect(result['cortex-chat']).toBeNull();
    });
  });

  describe('setRoleAssignment', () => {
    it('assigns ollama models to non-reasoner roles', async () => {
      const { ctx } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);

      const result = await caller.setRoleAssignment({
        role: 'orchestrators',
        modelSpec: 'ollama:llama3.2:3b',
      });

      expect(result).toEqual({ success: true });
      expect(bootstrapMock.buildOllamaProviderConfig).toHaveBeenCalledWith(
        'llama3.2:3b',
        bootstrapConstants.OLLAMA_WELL_KNOWN_PROVIDER_ID,
      );
      expect(bootstrapMock.buildProviderConfig).not.toHaveBeenCalled();
      expect(bootstrapMock.upsertProviderConfig).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          id: bootstrapConstants.OLLAMA_WELL_KNOWN_PROVIDER_ID,
          name: 'ollama',
          modelId: 'llama3.2:3b',
        }),
      );
      expect(bootstrapMock.updateRoleAssignment).toHaveBeenCalledWith(
        ctx,
        'orchestrators',
        bootstrapConstants.OLLAMA_WELL_KNOWN_PROVIDER_ID,
      );
    });

    it('assigns cloud models through the existing provider config path', async () => {
      const { ctx } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);

      const result = await caller.setRoleAssignment({
        role: 'cortex-chat',
        modelSpec: 'openai:gpt-4o-mini',
      });

      expect(result).toEqual({ success: true });
      expect(bootstrapMock.buildProviderConfig).toHaveBeenCalledWith(
        'openai',
        bootstrapConstants.WELL_KNOWN_PROVIDER_IDS.openai,
        'gpt-4o-mini',
      );
      expect(bootstrapMock.buildOllamaProviderConfig).not.toHaveBeenCalled();
      expect(bootstrapMock.updateRoleAssignment).toHaveBeenCalledWith(
        ctx,
        'cortex-chat',
        bootstrapConstants.WELL_KNOWN_PROVIDER_IDS.openai,
      );
    });

    it('assigns Codex CLI through the provider-definition config path', async () => {
      const { ctx } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);

      const result = await caller.setRoleAssignment({
        role: 'workers',
        modelSpec: 'codex-cli:codex-cli/default',
      });

      expect(result).toEqual({ success: true });
      expect(bootstrapMock.buildProviderConfig).toHaveBeenCalledWith(
        'codex-cli',
        bootstrapConstants.WELL_KNOWN_PROVIDER_IDS['codex-cli'],
        'codex-cli/default',
      );
      expect(bootstrapMock.buildOllamaProviderConfig).not.toHaveBeenCalled();
      expect(bootstrapMock.upsertProviderConfig).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          id: bootstrapConstants.WELL_KNOWN_PROVIDER_IDS['codex-cli'],
          name: 'codex-cli',
          modelId: 'codex-cli/default',
          capabilities: ['chat'],
        }),
      );
      expect(bootstrapMock.updateRoleAssignment).toHaveBeenCalledWith(
        ctx,
        'workers',
        bootstrapConstants.WELL_KNOWN_PROVIDER_IDS['codex-cli'],
      );
    });

    it('rejects Codex CLI for persistent Cortex chat roles', async () => {
      const { ctx } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);

      const result = await caller.setRoleAssignment({
        role: 'cortex-chat',
        modelSpec: 'codex-cli:codex-cli/default',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('requires persistent_process');
      expect(bootstrapMock.upsertProviderConfig).not.toHaveBeenCalled();
      expect(bootstrapMock.updateRoleAssignment).not.toHaveBeenCalled();
    });

    it('clears role assignments when modelSpec is null', async () => {
      const { ctx } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);

      const result = await caller.setRoleAssignment({
        role: 'cortex-system',
        modelSpec: null,
      });

      expect(result).toEqual({ success: true });
      expect(bootstrapMock.upsertProviderConfig).not.toHaveBeenCalled();
      expect(bootstrapMock.updateRoleAssignment).toHaveBeenCalledWith(
        ctx,
        'cortex-system',
        null,
      );
    });

    it('returns an error for invalid model specs', async () => {
      const { ctx } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);

      bootstrapMock.parseSelectedModelSpec.mockReturnValueOnce(null);

      const result = await caller.setRoleAssignment({
        role: 'workers',
        modelSpec: 'invalid-model-spec',
      });

      expect(result).toEqual({
        success: false,
        error: 'Cannot parse model spec: invalid-model-spec',
      });
      expect(bootstrapMock.upsertProviderConfig).not.toHaveBeenCalled();
      expect(bootstrapMock.updateRoleAssignment).not.toHaveBeenCalled();
    });
  });

  describe('getAvailableModels', () => {
    it('includes Codex CLI default model without credentials or Ollama', async () => {
      const { ctx } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);
      const fetchMock = vi.mocked(globalThis.fetch);

      const result = await caller.getAvailableModels();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.models).toEqual([CODEX_CLI_DEFAULT_MODEL]);
    });

    it('fetches Anthropic models dynamically and maps display names to the existing shape', async () => {
      const { ctx, credentialVaultService } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);
      const fetchMock = vi.mocked(globalThis.fetch);

      await credentialVaultService.store(SYSTEM_APP_ID, {
        key: vaultKey('anthropic'),
        value: 'sk-ant-dynamic',
        credential_type: 'api_key',
        target_host: 'api.anthropic.com',
        injection_location: 'header',
        injection_key: 'x-api-key',
      });

      fetchMock.mockImplementationOnce(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          expect(input).toBe('https://api.anthropic.com/v1/models');
          expect(init).toMatchObject({
            method: 'GET',
            headers: {
              'x-api-key': 'sk-ant-dynamic',
              'anthropic-version': '2023-06-01',
            },
          });

          return jsonResponse({
            data: [
              {
                id: 'claude-sonnet-4-20250514',
                display_name: 'Claude Sonnet 4',
                type: 'model',
              },
              {
                id: 'claude-opus-4-20250514',
                display_name: 'Claude Opus 4',
                type: 'model',
              },
            ],
          });
        },
      );

      const result = await caller.getAvailableModels();

      expect(result.models).toEqual([
        {
          id: 'anthropic:claude-sonnet-4-20250514',
          name: 'Claude Sonnet 4',
          provider: 'anthropic',
          providerLabel: 'Anthropic',
          available: true,
        },
        {
          id: 'anthropic:claude-opus-4-20250514',
          name: 'Claude Opus 4',
          provider: 'anthropic',
          providerLabel: 'Anthropic',
          available: true,
        },
        CODEX_CLI_DEFAULT_MODEL,
      ]);
      expect(
        result.models.some(
          (model) => model.id === 'anthropic:claude-haiku-3-5-20241022',
        ),
      ).toBe(false);
    });

    it('returns OpenAI /v1/models results without prefix filtering', async () => {
      const { ctx, credentialVaultService } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);
      const fetchMock = vi.mocked(globalThis.fetch);

      await credentialVaultService.store(SYSTEM_APP_ID, {
        key: vaultKey('openai'),
        value: 'sk-openai-dynamic',
        credential_type: 'api_key',
        target_host: 'api.openai.com',
        injection_location: 'header',
        injection_key: 'Authorization',
      });

      fetchMock.mockImplementationOnce(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          expect(input).toBe('https://api.openai.com/v1/models');
          expect(init).toMatchObject({
            method: 'GET',
            headers: {
              Authorization: 'Bearer sk-openai-dynamic',
            },
          });

          return jsonResponse({
            object: 'list',
            data: [
              { id: 'gpt-4o', object: 'model', owned_by: 'openai' },
              { id: 'o3-mini', object: 'model', owned_by: 'openai' },
              {
                id: 'text-embedding-3-small',
                object: 'model',
                owned_by: 'openai',
              },
              { id: 'whisper-1', object: 'model', owned_by: 'openai' },
            ],
          });
        },
      );

      const result = await caller.getAvailableModels();

      expect(result.models).toEqual([
        {
          id: 'openai:gpt-4o',
          name: 'gpt-4o',
          provider: 'openai',
          providerLabel: 'OpenAI',
          available: true,
        },
        {
          id: 'openai:o3-mini',
          name: 'o3-mini',
          provider: 'openai',
          providerLabel: 'OpenAI',
          available: true,
        },
        {
          id: 'openai:text-embedding-3-small',
          name: 'text-embedding-3-small',
          provider: 'openai',
          providerLabel: 'OpenAI',
          available: true,
        },
        {
          id: 'openai:whisper-1',
          name: 'whisper-1',
          provider: 'openai',
          providerLabel: 'OpenAI',
          available: true,
        },
        CODEX_CLI_DEFAULT_MODEL,
      ]);
    });

    it('discovers a fixture OpenAI-compatible provider without first-party prefix filtering', async () => {
      const { ctx, credentialVaultService } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);
      const fetchMock = vi.mocked(globalThis.fetch);

      await credentialVaultService.store(SYSTEM_APP_ID, {
        key: vaultKey('fixture'),
        value: 'fixture-key',
        credential_type: 'api_key',
        target_host: 'fixture.example.com',
        injection_location: 'header',
        injection_key: 'X-Fixture-Key',
      });

      fetchMock.mockImplementationOnce(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          expect(input).toBe('https://fixture.example.com/v1/models');
          expect(init).toMatchObject({
            method: 'GET',
            headers: {
              'X-Fixture-Key': 'fixture-key',
            },
          });

          return jsonResponse({
            object: 'list',
            data: [
              { id: 'fixture-chat', object: 'model', owned_by: 'fixture' },
              { id: 'fixture-embedding', object: 'model', owned_by: 'fixture' },
            ],
          });
        },
      );

      const result = await caller.getAvailableModels();

      expect(result.models).toEqual([
        {
          id: 'fixture:fixture-chat',
          name: 'fixture-chat',
          provider: 'fixture',
          providerLabel: 'Fixture AI',
          available: true,
        },
        {
          id: 'fixture:fixture-embedding',
          name: 'fixture-embedding',
          provider: 'fixture',
          providerLabel: 'Fixture AI',
          available: true,
        },
        CODEX_CLI_DEFAULT_MODEL,
      ]);
    });

    it('fetches Ollama models through provider discovery metadata when running', async () => {
      const { ctx } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);
      const fetchMock = vi.mocked(globalThis.fetch);

      detectOllamaMock.mockResolvedValueOnce({
        installed: true,
        running: true,
        state: 'running',
        models: ['llama3.2:3b'],
        defaultModel: 'llama3.2:3b',
      });

      fetchMock.mockImplementationOnce(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          expect(input).toBe('http://localhost:11434/v1/models');
          expect(init).toMatchObject({
            method: 'GET',
            headers: {},
          });

          return jsonResponse({
            object: 'list',
            data: [
              { id: 'llama3.2:3b', object: 'model', owned_by: 'ollama' },
              { id: 'qwen2.5:7b', object: 'model', owned_by: 'ollama' },
            ],
          });
        },
      );

      const result = await caller.getAvailableModels();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.models).toEqual([
        {
          id: 'ollama:llama3.2:3b',
          name: 'llama3.2:3b',
          provider: 'ollama',
          providerLabel: 'Ollama',
          available: true,
        },
        {
          id: 'ollama:qwen2.5:7b',
          name: 'qwen2.5:7b',
          provider: 'ollama',
          providerLabel: 'Ollama',
          available: true,
        },
        CODEX_CLI_DEFAULT_MODEL,
      ]);
    });

    it('uses the configured Ollama endpoint for detection and model discovery', async () => {
      const { ctx } = createMockContext();
      ctx.config.get.mockReturnValue({
        providers: [
          {
            id: bootstrapConstants.OLLAMA_WELL_KNOWN_PROVIDER_ID,
            isLocal: true,
            endpoint: 'http://configured-ollama:11435',
          },
        ],
      });
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);
      const fetchMock = vi.mocked(globalThis.fetch);

      detectOllamaMock.mockResolvedValueOnce({
        installed: true,
        running: true,
        state: 'running',
        models: ['llama3.2:3b'],
        defaultModel: 'llama3.2:3b',
      });

      fetchMock.mockImplementationOnce(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          expect(input).toBe('http://configured-ollama:11435/v1/models');
          expect(init).toMatchObject({
            method: 'GET',
            headers: {},
          });

          return jsonResponse({
            object: 'list',
            data: [{ id: 'llama3.2:3b', object: 'model', owned_by: 'ollama' }],
          });
        },
      );

      const result = await caller.getAvailableModels();

      expect(detectOllamaMock).toHaveBeenCalledWith('http://configured-ollama:11435');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.models[0]).toEqual({
        id: 'ollama:llama3.2:3b',
        name: 'llama3.2:3b',
        provider: 'ollama',
        providerLabel: 'Ollama',
        available: true,
      });
    });

    it('does not cache Ollama model discovery results across local model changes', async () => {
      const { ctx } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);
      const fetchMock = vi.mocked(globalThis.fetch);

      detectOllamaMock.mockResolvedValue({
        installed: true,
        running: true,
        state: 'running',
        models: ['llama3.2:3b'],
        defaultModel: 'llama3.2:3b',
      });

      fetchMock
        .mockResolvedValueOnce(jsonResponse({
          object: 'list',
          data: [{ id: 'llama3.2:3b', object: 'model', owned_by: 'ollama' }],
        }))
        .mockResolvedValueOnce(jsonResponse({
          object: 'list',
          data: [{ id: 'qwen2.5:7b', object: 'model', owned_by: 'ollama' }],
        }));

      const first = await caller.getAvailableModels();
      const second = await caller.getAvailableModels();

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(first.models[0]).toEqual(
        expect.objectContaining({ id: 'ollama:llama3.2:3b' }),
      );
      expect(second.models[0]).toEqual(
        expect.objectContaining({ id: 'ollama:qwen2.5:7b' }),
      );
    });

    it('returns fallback models when the provider API fails', async () => {
      const { ctx, credentialVaultService } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);
      const fetchMock = vi.mocked(globalThis.fetch);

      await credentialVaultService.store(SYSTEM_APP_ID, {
        key: vaultKey('anthropic'),
        value: 'sk-ant-fallback',
        credential_type: 'api_key',
        target_host: 'api.anthropic.com',
        injection_location: 'header',
        injection_key: 'x-api-key',
      });

      fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'upstream' }, 503));

      const result = await caller.getAvailableModels();

      expect(result.models).toEqual([
        {
          id: 'anthropic:claude-sonnet-4-20250514',
          name: 'claude-sonnet-4-20250514 (cached)',
          provider: 'anthropic',
          providerLabel: 'Anthropic',
          available: false,
        },
        CODEX_CLI_DEFAULT_MODEL,
      ]);
    });

    it('returns fallback models when response parsing fails', async () => {
      const { ctx, credentialVaultService } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);
      const fetchMock = vi.mocked(globalThis.fetch);

      await credentialVaultService.store(SYSTEM_APP_ID, {
        key: vaultKey('openai'),
        value: 'sk-openai-invalid',
        credential_type: 'api_key',
        target_host: 'api.openai.com',
        injection_location: 'header',
        injection_key: 'Authorization',
      });

      fetchMock.mockResolvedValueOnce(jsonResponse({ nope: true }));

      const result = await caller.getAvailableModels();

      expect(result.models).toEqual([
        {
          id: 'openai:gpt-4o',
          name: 'gpt-4o (cached)',
          provider: 'openai',
          providerLabel: 'OpenAI',
          available: false,
        },
        CODEX_CLI_DEFAULT_MODEL,
      ]);
    });

    it('returns the default model fallback for fixture providers', async () => {
      const { ctx, credentialVaultService } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);
      const fetchMock = vi.mocked(globalThis.fetch);

      await credentialVaultService.store(SYSTEM_APP_ID, {
        key: vaultKey('fixture'),
        value: 'fixture-key',
        credential_type: 'api_key',
        target_host: 'fixture.example.com',
        injection_location: 'header',
        injection_key: 'X-Fixture-Key',
      });

      fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'upstream' }, 503));

      const result = await caller.getAvailableModels();

      expect(result.models).toEqual([
        {
          id: 'fixture:fixture-default',
          name: 'fixture-default (cached)',
          provider: 'fixture',
          providerLabel: 'Fixture AI',
          available: false,
        },
        CODEX_CLI_DEFAULT_MODEL,
      ]);
    });

    it('caches successful provider responses until the TTL expires', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-21T08:00:00.000Z'));

      const { ctx, credentialVaultService } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);
      const fetchMock = vi.mocked(globalThis.fetch);

      await credentialVaultService.store(SYSTEM_APP_ID, {
        key: vaultKey('openai'),
        value: 'sk-openai-cache',
        credential_type: 'api_key',
        target_host: 'api.openai.com',
        injection_location: 'header',
        injection_key: 'Authorization',
      });

      fetchMock
        .mockResolvedValueOnce(
          jsonResponse({
            object: 'list',
            data: [{ id: 'gpt-4o', object: 'model', owned_by: 'openai' }],
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            object: 'list',
            data: [{ id: 'o3', object: 'model', owned_by: 'openai' }],
          }),
        );

      const first = await caller.getAvailableModels();
      const second = await caller.getAvailableModels();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(first.models).toEqual([
        {
          id: 'openai:gpt-4o',
          name: 'gpt-4o',
          provider: 'openai',
          providerLabel: 'OpenAI',
          available: true,
        },
        CODEX_CLI_DEFAULT_MODEL,
      ]);
      expect(second.models).toEqual(first.models);

      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      const third = await caller.getAvailableModels();

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(third.models).toEqual([
        {
          id: 'openai:o3',
          name: 'o3',
          provider: 'openai',
          providerLabel: 'OpenAI',
          available: true,
        },
        CODEX_CLI_DEFAULT_MODEL,
      ]);
    });

    it('invalidates cached provider models when keys are updated or deleted', async () => {
      const { ctx, credentialVaultService } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);
      const fetchMock = vi.mocked(globalThis.fetch);

      await credentialVaultService.store(SYSTEM_APP_ID, {
        key: vaultKey('openai'),
        value: 'sk-openai-cache-1',
        credential_type: 'api_key',
        target_host: 'api.openai.com',
        injection_location: 'header',
        injection_key: 'Authorization',
      });

      fetchMock
        .mockImplementationOnce(
          async (_input: RequestInfo | URL, init?: RequestInit) => {
            expect(init?.headers).toMatchObject({
              Authorization: 'Bearer sk-openai-cache-1',
            });
            return jsonResponse({
              object: 'list',
              data: [{ id: 'gpt-4o', object: 'model', owned_by: 'openai' }],
            });
          },
        )
        .mockImplementationOnce(
          async (_input: RequestInfo | URL, init?: RequestInit) => {
            expect(init?.headers).toMatchObject({
              Authorization: 'Bearer sk-openai-cache-2',
            });
            return jsonResponse({
              object: 'list',
              data: [{ id: 'o3', object: 'model', owned_by: 'openai' }],
            });
          },
        );

      const first = await caller.getAvailableModels();
      await caller.setApiKey({
        provider: 'openai',
        key: 'sk-openai-cache-2',
      });
      const second = await caller.getAvailableModels();
      await caller.deleteApiKey({ provider: 'openai' });
      const third = await caller.getAvailableModels();

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(first.models[0]).toEqual(
        expect.objectContaining({ id: 'openai:gpt-4o' }),
      );
      expect(second.models[0]).toEqual(
        expect.objectContaining({ id: 'openai:o3' }),
      );
      expect(third.models).toEqual([CODEX_CLI_DEFAULT_MODEL]);
    });
  });
});
