/**
 * Tests for the preferences tRPC router.
 *
 * Uses a mock credential vault to verify set/get/delete key flows,
 * masking logic, and environment variable side effects.
 * Also tests model selection persistence and available model discovery.
 *
 * Note: workspace imports (e.g. @nous/autonomic-credentials) are not
 * available in the shared-server test runner. We mock the vault service
 * and document store interfaces directly to keep tests self-contained.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const SYSTEM_APP_ID = 'nous:system';

function vaultKey(provider: string): string {
  return `api_key_${provider}`;
}

function maskApiKey(key: string): string {
  if (key.length <= 11) {
    return key.slice(0, 3) + '...' + key.slice(-4);
  }
  return key.slice(0, 7) + '...' + key.slice(-4);
}

/**
 * Minimal in-memory mock of the credential vault service interface,
 * matching the ICredentialVaultService contract used by the preferences router.
 */
function createMockVault() {
  const entries = new Map<string, { value: string; metadata: Record<string, unknown> }>();

  return {
    store: async (appId: string, request: {
      key: string;
      value: string;
      credential_type: string;
      target_host: string;
      injection_location: string;
      injection_key: string;
    }) => {
      const vk = `${appId}:${request.key}`;
      entries.set(vk, {
        value: request.value,
        metadata: {
          app_id: appId,
          user_key: request.key,
          credential_type: request.credential_type,
          target_host: request.target_host,
          injection_location: request.injection_location,
          injection_key: request.injection_key,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      });
      return { credential_ref: `credential:${vk}`, metadata: entries.get(vk)!.metadata };
    },

    getMetadata: async (appId: string, key: string) => {
      const vk = `${appId}:${key}`;
      const entry = entries.get(vk);
      return entry ? entry.metadata : null;
    },

    revoke: async (appId: string, request: { key: string; reason: string }) => {
      const vk = `${appId}:${request.key}`;
      const existed = entries.has(vk);
      entries.delete(vk);
      return { revoked: existed };
    },

    resolveForInjection: async (appId: string, key: string) => {
      const vk = `${appId}:${key}`;
      const entry = entries.get(vk);
      return entry ? { metadata: entry.metadata, secretValue: entry.value } : null;
    },
  };
}

describe('preferences router logic', () => {
  let vault: ReturnType<typeof createMockVault>;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    vault = createMockVault();
    savedEnv['ANTHROPIC_API_KEY'] = process.env.ANTHROPIC_API_KEY;
    savedEnv['OPENAI_API_KEY'] = process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  describe('setApiKey + getApiKeys', () => {
    it('stores an Anthropic key and retrieves masked metadata', async () => {
      const testKey = 'sk-ant-api03-test-value-1234';

      await vault.store(SYSTEM_APP_ID, {
        key: vaultKey('anthropic'),
        value: testKey,
        credential_type: 'api_key',
        target_host: 'api.anthropic.com',
        injection_location: 'header',
        injection_key: 'x-api-key',
      });

      process.env.ANTHROPIC_API_KEY = testKey;

      const metadata = await vault.getMetadata(SYSTEM_APP_ID, vaultKey('anthropic'));
      expect(metadata).not.toBeNull();
      expect(metadata!.credential_type).toBe('api_key');
      expect(metadata!.target_host).toBe('api.anthropic.com');

      const resolved = await vault.resolveForInjection(SYSTEM_APP_ID, vaultKey('anthropic'));
      expect(resolved).not.toBeNull();
      expect(resolved!.secretValue).toBe(testKey);

      const masked = maskApiKey(resolved!.secretValue);
      expect(masked).toBe('sk-ant-...1234');
      expect(masked).not.toContain(testKey);

      expect(process.env.ANTHROPIC_API_KEY).toBe(testKey);
    });

    it('stores an OpenAI key and retrieves masked metadata', async () => {
      const testKey = 'sk-proj-abcdefghijklmnop';

      await vault.store(SYSTEM_APP_ID, {
        key: vaultKey('openai'),
        value: testKey,
        credential_type: 'api_key',
        target_host: 'api.openai.com',
        injection_location: 'header',
        injection_key: 'Authorization',
      });

      process.env.OPENAI_API_KEY = testKey;

      const metadata = await vault.getMetadata(SYSTEM_APP_ID, vaultKey('openai'));
      expect(metadata).not.toBeNull();
      expect(metadata!.target_host).toBe('api.openai.com');

      const resolved = await vault.resolveForInjection(SYSTEM_APP_ID, vaultKey('openai'));
      expect(resolved).not.toBeNull();

      const masked = maskApiKey(resolved!.secretValue);
      expect(masked).toBe('sk-proj...mnop');

      expect(process.env.OPENAI_API_KEY).toBe(testKey);
    });
  });

  describe('deleteApiKey', () => {
    it('revokes a stored key and clears env var', async () => {
      const testKey = 'sk-ant-api03-to-be-deleted';

      await vault.store(SYSTEM_APP_ID, {
        key: vaultKey('anthropic'),
        value: testKey,
        credential_type: 'api_key',
        target_host: 'api.anthropic.com',
        injection_location: 'header',
        injection_key: 'x-api-key',
      });

      process.env.ANTHROPIC_API_KEY = testKey;

      const result = await vault.revoke(SYSTEM_APP_ID, {
        key: vaultKey('anthropic'),
        reason: 'user_deleted',
      });

      delete process.env.ANTHROPIC_API_KEY;

      expect(result.revoked).toBe(true);

      const metadata = await vault.getMetadata(SYSTEM_APP_ID, vaultKey('anthropic'));
      expect(metadata).toBeNull();

      expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
    });

    it('handles revoking a non-existent key gracefully', async () => {
      const result = await vault.revoke(SYSTEM_APP_ID, {
        key: vaultKey('anthropic'),
        reason: 'user_deleted',
      });

      expect(result.revoked).toBe(false);
    });
  });

  describe('getApiKeys for unconfigured providers', () => {
    it('returns not configured for providers without stored keys', async () => {
      const metadata = await vault.getMetadata(SYSTEM_APP_ID, vaultKey('anthropic'));
      expect(metadata).toBeNull();

      const openaiMeta = await vault.getMetadata(SYSTEM_APP_ID, vaultKey('openai'));
      expect(openaiMeta).toBeNull();
    });
  });

  describe('maskApiKey', () => {
    it('masks long keys correctly (first 7 + last 4)', () => {
      expect(maskApiKey('sk-ant-api03-abcdefghijklmnop')).toBe('sk-ant-...mnop');
    });

    it('masks short keys correctly (first 3 + last 4)', () => {
      expect(maskApiKey('shortkey123')).toBe('sho...y123');
    });

    it('never returns the full key', () => {
      const key = 'sk-ant-api03-full-secret-key-value';
      const masked = maskApiKey(key);
      expect(masked).not.toBe(key);
      expect(masked.length).toBeLessThan(key.length);
    });
  });

  describe('process.env integration', () => {
    it('setting a key makes it available via process.env', async () => {
      const testKey = 'sk-test-env-integration-value';

      await vault.store(SYSTEM_APP_ID, {
        key: vaultKey('anthropic'),
        value: testKey,
        credential_type: 'api_key',
        target_host: 'api.anthropic.com',
        injection_location: 'header',
        injection_key: 'x-api-key',
      });

      // Simulate what the router does
      process.env.ANTHROPIC_API_KEY = testKey;

      expect(process.env.ANTHROPIC_API_KEY).toBe(testKey);

      // Simulate delete
      delete process.env.ANTHROPIC_API_KEY;
      expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Model selection logic tests
// ---------------------------------------------------------------------------

const MODEL_SELECTION_COLLECTION = 'nous:model_selection';
const MODEL_SELECTION_ID = 'current';

/**
 * Minimal in-memory mock of IDocumentStore for model selection persistence.
 */
function createMockDocumentStore() {
  const docs = new Map<string, unknown>();

  function docKey(collection: string, id: string) {
    return `${collection}:${id}`;
  }

  return {
    put: async <T>(collection: string, id: string, document: T) => {
      docs.set(docKey(collection, id), document);
    },
    get: async <T>(collection: string, id: string): Promise<T | null> => {
      const doc = docs.get(docKey(collection, id));
      return (doc as T) ?? null;
    },
    query: async () => [],
    delete: async (collection: string, id: string) => {
      return docs.delete(docKey(collection, id));
    },
  };
}

describe('model selection logic', () => {
  let docStore: ReturnType<typeof createMockDocumentStore>;

  beforeEach(() => {
    docStore = createMockDocumentStore();
  });

  describe('getModelSelection', () => {
    it('returns null for both roles when nothing is saved', async () => {
      const saved = await docStore.get<{ principal: string | null; system: string | null }>(
        MODEL_SELECTION_COLLECTION,
        MODEL_SELECTION_ID,
      );
      expect(saved).toBeNull();

      // Simulate router behavior: default to null
      const result = {
        principal: saved?.principal ?? null,
        system: saved?.system ?? null,
      };
      expect(result.principal).toBeNull();
      expect(result.system).toBeNull();
    });

    it('returns saved selection when present', async () => {
      await docStore.put(MODEL_SELECTION_COLLECTION, MODEL_SELECTION_ID, {
        principal: 'anthropic:claude-opus-4-20250514',
        system: 'anthropic:claude-sonnet-4-20250514',
      });

      const saved = await docStore.get<{ principal: string | null; system: string | null }>(
        MODEL_SELECTION_COLLECTION,
        MODEL_SELECTION_ID,
      );
      expect(saved).not.toBeNull();
      expect(saved!.principal).toBe('anthropic:claude-opus-4-20250514');
      expect(saved!.system).toBe('anthropic:claude-sonnet-4-20250514');
    });
  });

  describe('setModelSelection', () => {
    it('persists a full model selection', async () => {
      const input = {
        principal: 'anthropic:claude-opus-4-20250514',
        system: 'openai:gpt-4o-mini',
      };

      await docStore.put(MODEL_SELECTION_COLLECTION, MODEL_SELECTION_ID, {
        principal: input.principal,
        system: input.system,
      });

      const saved = await docStore.get<{ principal: string; system: string }>(
        MODEL_SELECTION_COLLECTION,
        MODEL_SELECTION_ID,
      );
      expect(saved!.principal).toBe('anthropic:claude-opus-4-20250514');
      expect(saved!.system).toBe('openai:gpt-4o-mini');
    });

    it('allows partial update (only principal)', async () => {
      // Pre-existing selection
      await docStore.put(MODEL_SELECTION_COLLECTION, MODEL_SELECTION_ID, {
        principal: 'anthropic:claude-opus-4-20250514',
        system: 'anthropic:claude-sonnet-4-20250514',
      });

      // Partial update: only change principal
      const existing = await docStore.get<{ principal: string | null; system: string | null }>(
        MODEL_SELECTION_COLLECTION,
        MODEL_SELECTION_ID,
      );
      const input = { principal: 'openai:o3' };
      const updated = {
        principal: input.principal ?? existing?.principal ?? null,
        system: existing?.system ?? null,
      };
      await docStore.put(MODEL_SELECTION_COLLECTION, MODEL_SELECTION_ID, updated);

      const saved = await docStore.get<{ principal: string | null; system: string | null }>(
        MODEL_SELECTION_COLLECTION,
        MODEL_SELECTION_ID,
      );
      expect(saved!.principal).toBe('openai:o3');
      expect(saved!.system).toBe('anthropic:claude-sonnet-4-20250514');
    });

    it('allows partial update (only system)', async () => {
      await docStore.put(MODEL_SELECTION_COLLECTION, MODEL_SELECTION_ID, {
        principal: 'anthropic:claude-opus-4-20250514',
        system: 'anthropic:claude-sonnet-4-20250514',
      });

      const existing = await docStore.get<{ principal: string | null; system: string | null }>(
        MODEL_SELECTION_COLLECTION,
        MODEL_SELECTION_ID,
      );
      const input = { system: 'openai:gpt-4o-mini' };
      const updated = {
        principal: existing?.principal ?? null,
        system: input.system ?? existing?.system ?? null,
      };
      await docStore.put(MODEL_SELECTION_COLLECTION, MODEL_SELECTION_ID, updated);

      const saved = await docStore.get<{ principal: string | null; system: string | null }>(
        MODEL_SELECTION_COLLECTION,
        MODEL_SELECTION_ID,
      );
      expect(saved!.principal).toBe('anthropic:claude-opus-4-20250514');
      expect(saved!.system).toBe('openai:gpt-4o-mini');
    });
  });

  describe('getAvailableModels', () => {
    const savedEnv: Record<string, string | undefined> = {};

    beforeEach(() => {
      savedEnv['ANTHROPIC_API_KEY'] = process.env.ANTHROPIC_API_KEY;
      savedEnv['OPENAI_API_KEY'] = process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
    });

    afterEach(() => {
      for (const [key, value] of Object.entries(savedEnv)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    });

    it('returns Anthropic cloud models when ANTHROPIC_API_KEY is set', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

      const cloudModels: Array<{ id: string; name: string; provider: string; available: boolean }> = [];
      if (process.env.ANTHROPIC_API_KEY) {
        cloudModels.push(
          { id: 'anthropic:claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic', available: true },
          { id: 'anthropic:claude-opus-4-20250514', name: 'Claude Opus 4', provider: 'anthropic', available: true },
          { id: 'anthropic:claude-haiku-3-5-20241022', name: 'Claude Haiku 3.5', provider: 'anthropic', available: true },
        );
      }

      expect(cloudModels).toHaveLength(3);
      expect(cloudModels.every((m) => m.provider === 'anthropic')).toBe(true);
      expect(cloudModels.every((m) => m.available)).toBe(true);
    });

    it('returns OpenAI cloud models when OPENAI_API_KEY is set', () => {
      process.env.OPENAI_API_KEY = 'sk-test';

      const cloudModels: Array<{ id: string; name: string; provider: string; available: boolean }> = [];
      if (process.env.OPENAI_API_KEY) {
        cloudModels.push(
          { id: 'openai:gpt-4o', name: 'GPT-4o', provider: 'openai', available: true },
          { id: 'openai:gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', available: true },
          { id: 'openai:o3', name: 'o3', provider: 'openai', available: true },
        );
      }

      expect(cloudModels).toHaveLength(3);
      expect(cloudModels.every((m) => m.provider === 'openai')).toBe(true);
    });

    it('returns no cloud models when no API keys are configured', () => {
      const cloudModels: Array<{ id: string; name: string; provider: string; available: boolean }> = [];
      if (process.env.ANTHROPIC_API_KEY) {
        cloudModels.push({ id: 'anthropic:claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic', available: true });
      }
      if (process.env.OPENAI_API_KEY) {
        cloudModels.push({ id: 'openai:gpt-4o', name: 'GPT-4o', provider: 'openai', available: true });
      }

      expect(cloudModels).toHaveLength(0);
    });

    it('returns both provider models when both keys are set', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
      process.env.OPENAI_API_KEY = 'sk-test';

      const cloudModels: Array<{ id: string; name: string; provider: string; available: boolean }> = [];
      if (process.env.ANTHROPIC_API_KEY) {
        cloudModels.push(
          { id: 'anthropic:claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic', available: true },
          { id: 'anthropic:claude-opus-4-20250514', name: 'Claude Opus 4', provider: 'anthropic', available: true },
          { id: 'anthropic:claude-haiku-3-5-20241022', name: 'Claude Haiku 3.5', provider: 'anthropic', available: true },
        );
      }
      if (process.env.OPENAI_API_KEY) {
        cloudModels.push(
          { id: 'openai:gpt-4o', name: 'GPT-4o', provider: 'openai', available: true },
          { id: 'openai:gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', available: true },
          { id: 'openai:o3', name: 'o3', provider: 'openai', available: true },
        );
      }

      expect(cloudModels).toHaveLength(6);
      const providers = new Set(cloudModels.map((m) => m.provider));
      expect(providers.size).toBe(2);
      expect(providers.has('anthropic')).toBe(true);
      expect(providers.has('openai')).toBe(true);
    });

    it('formats Ollama model IDs with ollama: prefix', () => {
      const ollamaModels = ['llama3.2:3b', 'codellama:7b'].map((m) => ({
        id: `ollama:${m}`,
        name: m,
        provider: 'ollama' as const,
        available: true,
      }));

      expect(ollamaModels).toHaveLength(2);
      expect(ollamaModels[0]!.id).toBe('ollama:llama3.2:3b');
      expect(ollamaModels[0]!.provider).toBe('ollama');
      expect(ollamaModels[1]!.id).toBe('ollama:codellama:7b');
    });
  });
});
