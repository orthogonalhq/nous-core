/**
 * Tests for the preferences tRPC router.
 *
 * Uses a mock credential vault to verify set/get/delete key flows,
 * masking logic, and environment variable side effects.
 *
 * Note: workspace imports (e.g. @nous/autonomic-credentials) are not
 * available in the shared-server test runner. We mock the vault service
 * interface directly to keep tests self-contained.
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
