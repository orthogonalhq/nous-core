import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderId, TraceId } from '@nous/shared';
import { DEFAULT_PROFILES } from '@nous/autonomic-config';
import {
  WELL_KNOWN_PROVIDER_IDS,
  createNousServices,
  loadModelSelection,
  loadStoredApiKeys,
  registerStoredProviders,
} from '../src/bootstrap';
import { preferencesRouter } from '../src/trpc/routers/preferences';

const SYSTEM_APP_ID = 'nous:system';
const MODEL_SELECTION_COLLECTION = 'nous:model_selection';
const MODEL_SELECTION_ID = 'current';

type ConfigState = {
  profile: (typeof DEFAULT_PROFILES)[keyof typeof DEFAULT_PROFILES] & {
    allowSilentLocalToRemoteFailover?: boolean;
  };
  providers: Array<{
    id: ProviderId;
    name: string;
    type: 'text';
    endpoint?: string;
    modelId: string;
    isLocal: boolean;
    capabilities: string[];
    providerClass?: 'remote_text' | 'local_text';
    meetsProfiles?: string[];
  }>;
  modelRoleAssignments: Array<{
    role: 'reasoner';
    providerId: ProviderId;
    fallbackProviderId?: ProviderId;
  }>;
};

function vaultKey(provider: 'anthropic' | 'openai'): string {
  return `api_key_${provider}`;
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
      const key = `${appId}:${request.key}`;
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
      entries.set(key, { value: request.value, metadata });
      return { credential_ref: `credential:${key}`, metadata };
    },
    getMetadata: async (appId: string, key: string) => {
      return entries.get(`${appId}:${key}`)?.metadata ?? null;
    },
    revoke: async (appId: string, request: { key: string; reason: string }) => {
      const entryKey = `${appId}:${request.key}`;
      const revoked = entries.delete(entryKey);
      return { revoked };
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

function createMockConfig(initial?: Partial<ConfigState>) {
  const state: ConfigState = {
    profile: { ...DEFAULT_PROFILES['local-only']! },
    providers: [],
    modelRoleAssignments: [],
    ...initial,
  };

  return {
    state,
    get: () => ({
      profile: { ...state.profile },
      providers: [...state.providers],
      modelRoleAssignments: [...state.modelRoleAssignments],
    }),
    getSection: vi.fn(),
    update: async (section: keyof ConfigState, value: unknown) => {
      const currentSection = state[section];
      if (
        typeof currentSection === 'object' &&
        currentSection != null &&
        !Array.isArray(currentSection)
      ) {
        state[section] = {
          ...(currentSection as Record<string, unknown>),
          ...(value as Record<string, unknown>),
        } as ConfigState[typeof section];
        return;
      }

      state[section] = value as ConfigState[typeof section];
    },
    reload: vi.fn(),
  };
}

function createLifecycleContext(initialConfig?: Partial<ConfigState>) {
  const config = createMockConfig(initialConfig);
  const providerConfigs = new Map<ProviderId, { id: ProviderId; modelId: string; name: string }>();
  const providerRegistry = {
    registerProvider: (providerConfig: {
      id: ProviderId;
      name: string;
      modelId: string;
    }) => {
      providerConfigs.set(providerConfig.id, providerConfig);
    },
    removeProvider: (providerId: ProviderId) => providerConfigs.delete(providerId),
    listProviders: () => Array.from(providerConfigs.values()),
    getProvider: (providerId: ProviderId) => {
      const provider = providerConfigs.get(providerId);
      return provider
        ? {
            getConfig: () => provider,
          }
        : null;
    },
  };
  const credentialVaultService = createMockVault();
  const documentStore = createMockDocumentStore();

  return {
    state: config.state,
    config,
    providerRegistry,
    credentialVaultService,
    documentStore,
    ctx: {
      config,
      providerRegistry,
      credentialVaultService,
      documentStore,
    } as any,
  };
}

describe('provider lifecycle wiring', () => {
  const originalFetch = globalThis.fetch;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    savedEnv.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('localhost:11434')) {
        throw { cause: { code: 'ECONNREFUSED' } };
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('loads stored keys and exposes cloud models on cold start', async () => {
    const { ctx, credentialVaultService } = createLifecycleContext();
    const caller = preferencesRouter.createCaller(ctx);

    await credentialVaultService.store(SYSTEM_APP_ID, {
      key: vaultKey('openai'),
      value: 'sk-test-openai',
      credential_type: 'api_key',
      target_host: 'api.openai.com',
      injection_location: 'header',
      injection_key: 'Authorization',
    });

    await loadStoredApiKeys(ctx);

    const result = await caller.getAvailableModels();
    expect(result.models.some((model) => model.provider === 'openai')).toBe(true);
    expect(process.env.OPENAI_API_KEY).toBe('sk-test-openai');
  });

  it('registerStoredProviders updates providers, assignments, and profile for cloud keys', async () => {
    const { ctx, state } = createLifecycleContext();
    process.env.OPENAI_API_KEY = 'sk-test-openai';

    await registerStoredProviders(ctx);

    expect(state.profile.name).toBe('hybrid');
    expect(state.profile.allowSilentLocalToRemoteFailover).toBe(true);
    expect(state.providers).toHaveLength(1);
    expect(state.providers[0]!.id).toBe(WELL_KNOWN_PROVIDER_IDS.openai);
    expect(state.modelRoleAssignments).toEqual([
      {
        role: 'reasoner',
        providerId: WELL_KNOWN_PROVIDER_IDS.openai,
      },
    ]);
  });

  it('loadModelSelection applies saved model selections to config', async () => {
    const { ctx, state, documentStore } = createLifecycleContext();
    process.env.OPENAI_API_KEY = 'sk-test-openai';
    process.env.ANTHROPIC_API_KEY = 'sk-test-anthropic';

    await registerStoredProviders(ctx);
    await documentStore.put(MODEL_SELECTION_COLLECTION, MODEL_SELECTION_ID, {
      principal: 'openai:gpt-4o-mini',
      system: 'anthropic:claude-opus-4-20250514',
    });

    await loadModelSelection(ctx);

    expect(
      state.providers.find((provider) => provider.id === WELL_KNOWN_PROVIDER_IDS.openai)
        ?.modelId,
    ).toBe('gpt-4o-mini');
    expect(
      state.providers.find((provider) => provider.id === WELL_KNOWN_PROVIDER_IDS.anthropic)
        ?.modelId,
    ).toBe('claude-opus-4-20250514');
    expect(state.modelRoleAssignments).toEqual([
      {
        role: 'reasoner',
        providerId: WELL_KNOWN_PROVIDER_IDS.openai,
        fallbackProviderId: WELL_KNOWN_PROVIDER_IDS.anthropic,
      },
    ]);
  });

  it('setApiKey registers the provider and updates config state', async () => {
    const { ctx, state } = createLifecycleContext();
    const caller = preferencesRouter.createCaller(ctx);

    await caller.setApiKey({
      provider: 'openai',
      key: 'sk-test-openai',
    });

    expect(process.env.OPENAI_API_KEY).toBe('sk-test-openai');
    expect(state.profile.name).toBe('hybrid');
    expect(state.profile.allowSilentLocalToRemoteFailover).toBe(true);
    expect(state.providers.map((provider) => provider.id)).toContain(
      WELL_KNOWN_PROVIDER_IDS.openai,
    );
    expect(state.modelRoleAssignments).toEqual([
      {
        role: 'reasoner',
        providerId: WELL_KNOWN_PROVIDER_IDS.openai,
      },
    ]);
  });

  it('deleteApiKey removes the provider and restores local-only profile', async () => {
    const { ctx, state } = createLifecycleContext();
    const caller = preferencesRouter.createCaller(ctx);

    await caller.setApiKey({
      provider: 'openai',
      key: 'sk-test-openai',
    });
    await caller.deleteApiKey({
      provider: 'openai',
    });

    expect(process.env.OPENAI_API_KEY).toBeUndefined();
    expect(state.providers).toHaveLength(0);
    expect(state.modelRoleAssignments).toHaveLength(0);
    expect(state.profile.name).toBe('local-only');
  });

  it('testApiKey resolves a stored key when the input omits key', async () => {
    const { ctx, credentialVaultService } = createLifecycleContext();
    const caller = preferencesRouter.createCaller(ctx);

    await credentialVaultService.store(SYSTEM_APP_ID, {
      key: vaultKey('openai'),
      value: 'sk-stored-openai',
      credential_type: 'api_key',
      target_host: 'api.openai.com',
      injection_location: 'header',
      injection_key: 'Authorization',
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('localhost:11434')) {
        throw { cause: { code: 'ECONNREFUSED' } };
      }

      expect(init?.headers).toEqual({
        Authorization: 'Bearer sk-stored-openai',
      });

      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await caller.testApiKey({
      provider: 'openai',
    });

    expect(result).toEqual({ valid: true, error: null });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.objectContaining({
        method: 'GET',
      }),
    );
  });

  it('keeps mock fallback active when no keys are configured', async () => {
    const dataDir = join(tmpdir(), `nous-shared-server-${randomUUID()}`);
    mkdirSync(dataDir, { recursive: true });
    const ctx = createNousServices({
      dataDir,
      runtimeLabel: 'test',
      publicBaseUrl: 'http://localhost:3000',
    });

    const result = await ctx.coreExecutor.executeTurn({
      message: 'hello mock',
      traceId: randomUUID() as TraceId,
    });

    expect(result.response).toContain('[Mock]');
  });
});
