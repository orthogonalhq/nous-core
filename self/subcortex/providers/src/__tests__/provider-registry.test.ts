import { ConfigError } from '@nous/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnthropicProvider } from '../anthropic-provider.js';
import { ProviderRegistry } from '../provider-registry.js';
import { LaneAwareProvider } from '../lane-aware-provider.js';
import { OllamaProvider } from '../ollama-provider.js';
import { OpenAiCompatibleProvider } from '../openai-provider.js';

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
});

describe('ProviderRegistry', () => {
  it('wraps configured providers with lane-aware behavior', () => {
    const registry = new ProviderRegistry({
      get: () => ({
        providers: [
          {
            id: '00000000-0000-0000-0000-000000000001',
            name: 'local',
            type: 'text',
            modelId: 'llama3.2',
            isLocal: true,
            capabilities: ['text'],
          },
        ],
      }),
      getSection: vi.fn(),
      update: vi.fn(),
      reload: vi.fn(),
    } as any);

    const provider = registry.getProvider(
      '00000000-0000-0000-0000-000000000001' as any,
    );

    expect(provider).toBeInstanceOf(LaneAwareProvider);
    expect(registry.listProviders()).toHaveLength(1);
  });

  it('registerProvider adds a provider that can be retrieved', () => {
    const registry = new ProviderRegistry({
      get: () => ({ providers: [] }),
      getSection: vi.fn(),
      update: vi.fn(),
      reload: vi.fn(),
    } as any);

    registry.registerProvider({
      id: '00000000-0000-0000-0000-000000000010' as any,
      name: 'local-extra',
      type: 'text',
      modelId: 'llama3.2:3b',
      isLocal: true,
      capabilities: ['text'],
    });

    expect(
      registry.getProvider('00000000-0000-0000-0000-000000000010' as any),
    ).toBeInstanceOf(LaneAwareProvider);
    expect(registry.listProviders()).toHaveLength(1);
  });

  it('registerProvider replaces an existing provider with the same id', () => {
    const registry = new ProviderRegistry({
      get: () => ({ providers: [] }),
      getSection: vi.fn(),
      update: vi.fn(),
      reload: vi.fn(),
    } as any);

    const providerId = '00000000-0000-0000-0000-000000000011' as any;

    registry.registerProvider({
      id: providerId,
      name: 'first',
      type: 'text',
      modelId: 'llama3.2',
      isLocal: true,
      capabilities: ['text'],
    });

    registry.registerProvider({
      id: providerId,
      name: 'second',
      type: 'text',
      modelId: 'codellama:7b',
      isLocal: true,
      capabilities: ['text'],
    });

    expect(registry.listProviders()).toHaveLength(1);
    expect(registry.getProvider(providerId)?.getConfig().name).toBe('second');
    expect(registry.getProvider(providerId)?.getConfig().modelId).toBe('codellama:7b');
  });

  it('registerProvider throws ConfigError for invalid config', () => {
    const registry = new ProviderRegistry({
      get: () => ({ providers: [] }),
      getSection: vi.fn(),
      update: vi.fn(),
      reload: vi.fn(),
    } as any);

    expect(() =>
      registry.registerProvider({
        id: 'not-a-uuid' as any,
        name: 'invalid',
        type: 'text',
        modelId: 'llama3.2',
        isLocal: true,
        capabilities: ['text'],
      }),
    ).toThrow(ConfigError);
  });

  it('removeProvider removes an existing provider and returns true', () => {
    const registry = new ProviderRegistry({
      get: () => ({ providers: [] }),
      getSection: vi.fn(),
      update: vi.fn(),
      reload: vi.fn(),
    } as any);

    const providerId = '00000000-0000-0000-0000-000000000012' as any;

    registry.registerProvider({
      id: providerId,
      name: 'local-remove',
      type: 'text',
      modelId: 'llama3.2',
      isLocal: true,
      capabilities: ['text'],
    });

    expect(registry.removeProvider(providerId)).toBe(true);
    expect(registry.getProvider(providerId)).toBeNull();
    expect(registry.listProviders()).toHaveLength(0);
  });

  it('removeProvider returns false for an unknown provider id', () => {
    const registry = new ProviderRegistry({
      get: () => ({ providers: [] }),
      getSection: vi.fn(),
      update: vi.fn(),
      reload: vi.fn(),
    } as any);

    expect(
      registry.removeProvider('00000000-0000-0000-0000-000000000099' as any),
    ).toBe(false);
  });

  it('normalizes anthropic remote providers to the Anthropic endpoint', () => {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

    const registry = new ProviderRegistry({
      get: () => ({ providers: [] }),
      getSection: vi.fn(),
      update: vi.fn(),
      reload: vi.fn(),
    } as any);

    registry.registerProvider({
      id: '00000000-0000-0000-0000-000000000013' as any,
      name: 'anthropic',
      type: 'text',
      endpoint: 'https://api.openai.com',
      modelId: 'claude-sonnet-4-20250514',
      isLocal: false,
      capabilities: ['chat', 'streaming'],
      providerClass: 'remote_text',
    });

    expect(
      registry
        .getProvider('00000000-0000-0000-0000-000000000013' as any)
        ?.getConfig().endpoint,
    ).toBe('https://api.anthropic.com');
  });

  it('routes anthropic endpoint configs to AnthropicProvider inside LaneAwareProvider', () => {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

    const registry = new ProviderRegistry({
      get: () => ({ providers: [] }),
      getSection: vi.fn(),
      update: vi.fn(),
      reload: vi.fn(),
    } as any);

    registry.registerProvider({
      id: '00000000-0000-0000-0000-000000000014' as any,
      name: 'remote-openai-looking-name',
      type: 'text',
      endpoint: 'https://api.anthropic.com',
      modelId: 'claude-sonnet-4-20250514',
      isLocal: false,
      capabilities: ['chat', 'streaming'],
      providerClass: 'remote_text',
    });

    const provider = registry.getProvider(
      '00000000-0000-0000-0000-000000000014' as any,
    ) as any;

    expect(provider).toBeInstanceOf(LaneAwareProvider);
    expect(provider.inner).toBeInstanceOf(AnthropicProvider);
  });

  it('routes anthropic name configs to AnthropicProvider inside LaneAwareProvider', () => {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

    const registry = new ProviderRegistry({
      get: () => ({ providers: [] }),
      getSection: vi.fn(),
      update: vi.fn(),
      reload: vi.fn(),
    } as any);

    registry.registerProvider({
      id: '00000000-0000-0000-0000-000000000015' as any,
      name: 'Anthropic Claude',
      type: 'text',
      endpoint: 'https://example.com/proxy',
      modelId: 'claude-sonnet-4-20250514',
      isLocal: false,
      capabilities: ['chat', 'streaming'],
      providerClass: 'remote_text',
    });

    const provider = registry.getProvider(
      '00000000-0000-0000-0000-000000000015' as any,
    ) as any;

    expect(provider).toBeInstanceOf(LaneAwareProvider);
    expect(provider.inner).toBeInstanceOf(AnthropicProvider);
    expect(provider.getConfig().endpoint).toBe('https://api.anthropic.com');
  });

  it('routes non-Anthropic remote providers to OpenAiCompatibleProvider inside LaneAwareProvider', () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const registry = new ProviderRegistry({
      get: () => ({ providers: [] }),
      getSection: vi.fn(),
      update: vi.fn(),
      reload: vi.fn(),
    } as any);

    registry.registerProvider({
      id: '00000000-0000-0000-0000-000000000016' as any,
      name: 'OpenRouter',
      type: 'text',
      endpoint: 'https://openrouter.ai/api',
      modelId: 'openai/gpt-4o-mini',
      isLocal: false,
      capabilities: ['chat'],
      providerClass: 'remote_text',
    });

    const provider = registry.getProvider(
      '00000000-0000-0000-0000-000000000016' as any,
    ) as any;

    expect(provider).toBeInstanceOf(LaneAwareProvider);
    expect(provider.inner).toBeInstanceOf(OpenAiCompatibleProvider);
  });

  it('constructor skips non-local entries when API key is unavailable', () => {
    // No ANTHROPIC_API_KEY set in env — constructor must not throw
    const registry = new ProviderRegistry({
      get: () => ({
        providers: [
          {
            id: '10000000-0000-0000-0000-000000000001',
            name: 'anthropic',
            type: 'text',
            endpoint: 'https://api.anthropic.com',
            modelId: 'claude-sonnet-4-20250514',
            isLocal: false,
            capabilities: ['chat', 'streaming'],
            providerClass: 'remote_text',
          },
        ],
      }),
      getSection: vi.fn(),
      update: vi.fn(),
      reload: vi.fn(),
    } as any);

    expect(
      registry.getProvider('10000000-0000-0000-0000-000000000001' as any),
    ).toBeNull();
    expect(registry.listProviders()).toHaveLength(0);
  });

  it('constructor still registers local entries when cloud entries are skipped', () => {
    // No ANTHROPIC_API_KEY set — Anthropic entry should be skipped,
    // but the local Ollama entry should still be registered.
    const registry = new ProviderRegistry({
      get: () => ({
        providers: [
          {
            id: '10000000-0000-0000-0000-000000000002',
            name: 'anthropic',
            type: 'text',
            endpoint: 'https://api.anthropic.com',
            modelId: 'claude-sonnet-4-20250514',
            isLocal: false,
            capabilities: ['chat', 'streaming'],
            providerClass: 'remote_text',
          },
          {
            id: '10000000-0000-0000-0000-000000000003',
            name: 'local-ollama',
            type: 'text',
            modelId: 'llama3.2',
            isLocal: true,
            capabilities: ['text'],
          },
        ],
      }),
      getSection: vi.fn(),
      update: vi.fn(),
      reload: vi.fn(),
    } as any);

    expect(
      registry.getProvider('10000000-0000-0000-0000-000000000002' as any),
    ).toBeNull();
    expect(
      registry.getProvider('10000000-0000-0000-0000-000000000003' as any),
    ).toBeInstanceOf(LaneAwareProvider);
    expect(registry.listProviders()).toHaveLength(1);
  });

  it('skipped cloud entry can be registered after construction via registerProvider', () => {
    // No ANTHROPIC_API_KEY set — Anthropic entry skipped during construction
    const registry = new ProviderRegistry({
      get: () => ({
        providers: [
          {
            id: '10000000-0000-0000-0000-000000000004',
            name: 'anthropic',
            type: 'text',
            endpoint: 'https://api.anthropic.com',
            modelId: 'claude-sonnet-4-20250514',
            isLocal: false,
            capabilities: ['chat', 'streaming'],
            providerClass: 'remote_text',
          },
        ],
      }),
      getSection: vi.fn(),
      update: vi.fn(),
      reload: vi.fn(),
    } as any);

    // Verify skipped
    expect(
      registry.getProvider('10000000-0000-0000-0000-000000000004' as any),
    ).toBeNull();

    // Simulate loadStoredApiKeys → registerStoredProviders
    process.env.ANTHROPIC_API_KEY = 'test-key';
    registry.registerProvider({
      id: '10000000-0000-0000-0000-000000000004' as any,
      name: 'anthropic',
      type: 'text',
      endpoint: 'https://api.anthropic.com',
      modelId: 'claude-sonnet-4-20250514',
      isLocal: false,
      capabilities: ['chat', 'streaming'],
      providerClass: 'remote_text',
    });

    expect(
      registry.getProvider('10000000-0000-0000-0000-000000000004' as any),
    ).toBeInstanceOf(LaneAwareProvider);
    expect(registry.listProviders()).toHaveLength(1);
  });

  it('routes local providers to OllamaProvider inside LaneAwareProvider', () => {
    const registry = new ProviderRegistry({
      get: () => ({ providers: [] }),
      getSection: vi.fn(),
      update: vi.fn(),
      reload: vi.fn(),
    } as any);

    registry.registerProvider({
      id: '00000000-0000-0000-0000-000000000017' as any,
      name: 'local-ollama',
      type: 'text',
      modelId: 'llama3.2',
      isLocal: true,
      capabilities: ['text'],
    });

    const provider = registry.getProvider(
      '00000000-0000-0000-0000-000000000017' as any,
    ) as any;

    expect(provider).toBeInstanceOf(LaneAwareProvider);
    expect(provider.inner).toBeInstanceOf(OllamaProvider);
  });
});
