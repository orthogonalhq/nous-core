import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SYSTEM_APP_ID = 'nous:system';
const MODEL_SELECTION_COLLECTION = 'nous:model_selection';
const MODEL_SELECTION_ID = 'current';
const MODEL_ROLES = [
  'orchestrator',
  'reasoner',
  'tool-advisor',
  'summarizer',
  'embedder',
  'reranker',
  'vision',
] as const;
type ModelRole = (typeof MODEL_ROLES)[number];

const detectOllamaMock = vi.hoisted(() => vi.fn());
const bootstrapConstants = vi.hoisted(() => ({
  WELL_KNOWN_PROVIDER_IDS: {
    anthropic: '10000000-0000-0000-0000-000000000001',
    openai: '10000000-0000-0000-0000-000000000002',
  },
  OLLAMA_WELL_KNOWN_PROVIDER_ID: '10000000-0000-0000-0000-000000000003',
}));
const bootstrapMock = vi.hoisted(() => ({
  buildOllamaProviderConfig: vi.fn(),
  buildProviderConfig: vi.fn(),
  currentRoleAssignment: vi.fn(),
  parseSelectedModelSpec: vi.fn(),
  registerConfiguredProvider: vi.fn(),
  removeConfiguredProvider: vi.fn(),
  updateRoleAssignment: vi.fn(),
  updateReasonerAssignment: vi.fn(),
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
  currentRoleAssignment: bootstrapMock.currentRoleAssignment,
  parseSelectedModelSpec: bootstrapMock.parseSelectedModelSpec,
  registerConfiguredProvider: bootstrapMock.registerConfiguredProvider,
  removeConfiguredProvider: bootstrapMock.removeConfiguredProvider,
  updateRoleAssignment: bootstrapMock.updateRoleAssignment,
  updateReasonerAssignment: bootstrapMock.updateReasonerAssignment,
  upsertProviderConfig: bootstrapMock.upsertProviderConfig,
}));

function vaultKey(provider: 'anthropic' | 'openai'): string {
  return `api_key_${provider}`;
}

function parseSelectedModelSpecMock(
  spec: string | null | undefined,
): { provider: 'anthropic' | 'openai' | 'ollama'; modelId: string } | null {
  if (!spec) {
    return null;
  }

  const [provider, ...modelParts] = spec.split(':');
  const modelId = modelParts.join(':');
  if (
    (provider !== 'anthropic' &&
      provider !== 'openai' &&
      provider !== 'ollama') ||
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
  provider: 'anthropic' | 'openai',
  providerId = bootstrapConstants.WELL_KNOWN_PROVIDER_IDS[provider],
  modelId = provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o',
) {
  return {
    id: providerId,
    name: provider,
    type: 'text' as const,
    endpoint:
      provider === 'anthropic'
        ? 'https://api.anthropic.com'
        : 'https://api.openai.com',
    modelId,
    isLocal: false,
    capabilities: ['chat', 'streaming'],
    providerClass: 'remote_text' as const,
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
        get: vi.fn(),
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
      models: [],
      defaultModel: null,
    });

    bootstrapMock.buildOllamaProviderConfig.mockReset();
    bootstrapMock.buildOllamaProviderConfig.mockImplementation(
      buildOllamaProviderConfigMock,
    );
    bootstrapMock.buildProviderConfig.mockReset();
    bootstrapMock.buildProviderConfig.mockImplementation(buildProviderConfigMock);
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
    bootstrapMock.updateReasonerAssignment.mockReset();
    bootstrapMock.updateReasonerAssignment.mockResolvedValue(undefined);
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
          configured: true,
          maskedKey: 'sk-ant-...1234',
        }),
      );
    });

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
          configured: false,
          maskedKey: null,
        }),
      );
    });
  });

  describe('setModelSelection', () => {
    it('persists the selection and applies the runtime provider config immediately', async () => {
      const { ctx, documentStore } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);

      const result = await caller.setModelSelection({
        principal: 'openai:o3',
        system: 'anthropic:claude-sonnet-4-20250514',
      });

      expect(result).toEqual({ success: true });
      expect(
        await documentStore.get<{
          principal: string | null;
          system: string | null;
        }>(MODEL_SELECTION_COLLECTION, MODEL_SELECTION_ID),
      ).toEqual({
        principal: 'openai:o3',
        system: 'anthropic:claude-sonnet-4-20250514',
      });
      expect(bootstrapMock.parseSelectedModelSpec).toHaveBeenCalledWith('openai:o3');
      expect(bootstrapMock.buildProviderConfig).toHaveBeenCalledWith(
        'openai',
        bootstrapConstants.WELL_KNOWN_PROVIDER_IDS.openai,
        'o3',
      );
      expect(bootstrapMock.upsertProviderConfig).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          id: bootstrapConstants.WELL_KNOWN_PROVIDER_IDS.openai,
          modelId: 'o3',
          name: 'openai',
        }),
      );
      expect(bootstrapMock.updateReasonerAssignment).toHaveBeenCalledWith(
        ctx,
        bootstrapConstants.WELL_KNOWN_PROVIDER_IDS.openai,
      );
    });

    it('routes ollama selections through the local provider config builder', async () => {
      const { ctx, documentStore } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);

      const result = await caller.setModelSelection({
        principal: 'ollama:llama3.2:3b',
      });

      expect(result).toEqual({ success: true });
      expect(
        await documentStore.get<{
          principal: string | null;
          system: string | null;
        }>(MODEL_SELECTION_COLLECTION, MODEL_SELECTION_ID),
      ).toEqual({
        principal: 'ollama:llama3.2:3b',
        system: null,
      });
      expect(bootstrapMock.parseSelectedModelSpec).toHaveBeenCalledWith(
        'ollama:llama3.2:3b',
      );
      expect(bootstrapMock.buildOllamaProviderConfig).toHaveBeenCalledWith(
        'llama3.2:3b',
        bootstrapConstants.OLLAMA_WELL_KNOWN_PROVIDER_ID,
      );
      expect(bootstrapMock.buildProviderConfig).not.toHaveBeenCalled();
      expect(bootstrapMock.upsertProviderConfig).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          id: bootstrapConstants.OLLAMA_WELL_KNOWN_PROVIDER_ID,
          modelId: 'llama3.2:3b',
          name: 'ollama',
          isLocal: true,
          providerClass: 'local_text',
        }),
      );
      expect(bootstrapMock.updateReasonerAssignment).toHaveBeenCalledWith(
        ctx,
        bootstrapConstants.OLLAMA_WELL_KNOWN_PROVIDER_ID,
      );
    });

    it('preserves existing values on partial updates', async () => {
      const { ctx, documentStore } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);

      await documentStore.put(MODEL_SELECTION_COLLECTION, MODEL_SELECTION_ID, {
        principal: 'anthropic:claude-opus-4-20250514',
        system: 'openai:gpt-4o',
      });

      await caller.setModelSelection({
        principal: 'anthropic:claude-sonnet-4-20250514',
      });

      expect(
        await documentStore.get<{
          principal: string | null;
          system: string | null;
        }>(MODEL_SELECTION_COLLECTION, MODEL_SELECTION_ID),
      ).toEqual({
        principal: 'anthropic:claude-sonnet-4-20250514',
        system: 'openai:gpt-4o',
      });
    });

    it('skips runtime updates for invalid model specs while preserving the document write', async () => {
      const { ctx, documentStore } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);

      bootstrapMock.parseSelectedModelSpec.mockReturnValueOnce(null);

      const result = await caller.setModelSelection({
        principal: 'invalid-model-spec',
      });

      expect(result).toEqual({ success: true });
      expect(
        await documentStore.get<{
          principal: string | null;
          system: string | null;
        }>(MODEL_SELECTION_COLLECTION, MODEL_SELECTION_ID),
      ).toEqual({
        principal: 'invalid-model-spec',
        system: null,
      });
      expect(bootstrapMock.buildProviderConfig).not.toHaveBeenCalled();
      expect(bootstrapMock.upsertProviderConfig).not.toHaveBeenCalled();
      expect(bootstrapMock.updateReasonerAssignment).not.toHaveBeenCalled();
    });

    it('catches runtime update failures and still returns success', async () => {
      const { ctx, documentStore } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);

      bootstrapMock.upsertProviderConfig.mockRejectedValueOnce(new Error('boom'));

      const result = await caller.setModelSelection({
        principal: 'anthropic:claude-opus-4-20250514',
      });

      expect(result).toEqual({ success: true });
      expect(
        await documentStore.get<{
          principal: string | null;
          system: string | null;
        }>(MODEL_SELECTION_COLLECTION, MODEL_SELECTION_ID),
      ).toEqual({
        principal: 'anthropic:claude-opus-4-20250514',
        system: null,
      });
      expect(bootstrapMock.updateReasonerAssignment).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
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
          if (role === 'orchestrator') {
            return {
              role,
              providerId: bootstrapConstants.OLLAMA_WELL_KNOWN_PROVIDER_ID,
            };
          }

          if (role === 'reasoner') {
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
        orchestrator: {
          providerId: bootstrapConstants.OLLAMA_WELL_KNOWN_PROVIDER_ID,
        },
        reasoner: {
          providerId: bootstrapConstants.WELL_KNOWN_PROVIDER_IDS.openai,
          fallbackProviderId: bootstrapConstants.WELL_KNOWN_PROVIDER_IDS.anthropic,
        },
        'tool-advisor': null,
        summarizer: null,
        embedder: null,
        reranker: null,
        vision: null,
      });
    });
  });

  describe('setRoleAssignment', () => {
    it('assigns ollama models to non-reasoner roles', async () => {
      const { ctx } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);

      const result = await caller.setRoleAssignment({
        role: 'orchestrator',
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
        'orchestrator',
        bootstrapConstants.OLLAMA_WELL_KNOWN_PROVIDER_ID,
      );
    });

    it('assigns cloud models through the existing provider config path', async () => {
      const { ctx } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);

      const result = await caller.setRoleAssignment({
        role: 'summarizer',
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
        'summarizer',
        bootstrapConstants.WELL_KNOWN_PROVIDER_IDS.openai,
      );
    });

    it('returns an error for invalid model specs', async () => {
      const { ctx } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);

      bootstrapMock.parseSelectedModelSpec.mockReturnValueOnce(null);

      const result = await caller.setRoleAssignment({
        role: 'vision',
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
          available: true,
        },
        {
          id: 'anthropic:claude-opus-4-20250514',
          name: 'Claude Opus 4',
          provider: 'anthropic',
          available: true,
        },
      ]);
      expect(
        result.models.some(
          (model) => model.id === 'anthropic:claude-haiku-3-5-20241022',
        ),
      ).toBe(false);
    });

    it('filters OpenAI /v1/models to chat-capable families', async () => {
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
          available: true,
        },
        {
          id: 'openai:o3-mini',
          name: 'o3-mini',
          provider: 'openai',
          available: true,
        },
      ]);
    });

    it('skips providers without keys and keeps Ollama detection unchanged', async () => {
      const { ctx } = createMockContext();
      const preferencesRouter = await loadPreferencesRouter();
      const caller = preferencesRouter.createCaller(ctx);
      const fetchMock = vi.mocked(globalThis.fetch);

      detectOllamaMock.mockResolvedValueOnce({
        installed: true,
        running: true,
        models: ['llama3.2:3b'],
        defaultModel: 'llama3.2:3b',
      });

      const result = await caller.getAvailableModels();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.models).toEqual([
        {
          id: 'ollama:llama3.2:3b',
          name: 'llama3.2:3b',
          provider: 'ollama',
          available: true,
        },
      ]);
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
          name: 'Claude Sonnet 4 (cached)',
          provider: 'anthropic',
          available: false,
        },
        {
          id: 'anthropic:claude-opus-4-20250514',
          name: 'Claude Opus 4 (cached)',
          provider: 'anthropic',
          available: false,
        },
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
          name: 'GPT-4o (cached)',
          provider: 'openai',
          available: false,
        },
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
          available: true,
        },
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
          available: true,
        },
      ]);
    });
  });
});
