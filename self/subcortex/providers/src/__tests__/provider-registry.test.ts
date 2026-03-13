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
});
