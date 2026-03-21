import { ConfigError } from '@nous/shared';
import { describe, expect, it, vi } from 'vitest';
import { ProviderRegistry } from '../provider-registry.js';
import { LaneAwareProvider } from '../lane-aware-provider.js';

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
    const originalKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

    try {
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
    } finally {
      if (originalKey === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = originalKey;
      }
    }
  });
});
