/**
 * Integration test: Router resolves role → ProviderRegistry returns provider → stream yields chunks.
 *
 * Uses a mock provider for determinism (no Ollama/OpenAI required).
 */
import { describe, it, expect, vi } from 'vitest';
import { ModelRouter } from '../model-router.js';
import { ProviderRegistry } from '@nous/subcortex-providers';

const PROVIDER_ID = '00000000-0000-0000-0000-000000000001' as const;

const createMockConfig = () => ({
  get: vi.fn().mockReturnValue({
    modelRoleAssignments: [
      { role: 'reasoner', providerId: PROVIDER_ID },
    ],
    providers: [
      {
        id: PROVIDER_ID,
        name: 'Mock',
        type: 'text',
        modelId: 'test',
        isLocal: true,
        capabilities: ['text'],
      },
    ],
    profile: { name: 'hybrid' },
  }),
});

describe('Router + Provider integration', () => {
  it('router resolves role → registry returns provider → stream yields chunks', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode(
                JSON.stringify({ response: 'Hello', done: false }) + '\n',
              ),
            })
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode(
                JSON.stringify({ response: ' world', done: true }) + '\n',
              ),
            })
            .mockResolvedValue({ done: true, value: undefined }),
          releaseLock: vi.fn(),
        }),
      },
    }));

    const config = createMockConfig();
    const router = new ModelRouter(config as any);
    const registry = new ProviderRegistry(config as any);

    const providerId = await router.route('reasoner');
    expect(providerId).toBe(PROVIDER_ID);

    const provider = registry.getProvider(providerId);
    expect(provider).not.toBeNull();

    const chunks: string[] = [];
    for await (const chunk of provider!.stream({
      role: 'reasoner',
      input: { prompt: 'Say hello' },
      traceId: '00000000-0000-0000-0000-000000000002' as any,
    })) {
      chunks.push(chunk.content);
    }

    expect(chunks.join('')).toContain('Hello');
  });
});
