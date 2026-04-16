/**
 * Unit tests for the Ollama endpoint get/set tRPC procedures.
 *
 * Verifies:
 * - getEndpoint returns default when no Ollama provider configured
 * - getEndpoint returns custom endpoint when provider has one
 * - setEndpoint with valid URL persists via upsertProviderConfig
 * - setEndpoint with null clears the endpoint override (reset to default)
 * - setEndpoint with invalid URL returns Zod validation error
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const OLLAMA_WELL_KNOWN_PROVIDER_ID = '10000000-0000-0000-0000-000000000003';
const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';

const upsertProviderConfigMock = vi.hoisted(() => vi.fn());
const buildOllamaProviderConfigMock = vi.hoisted(() =>
  vi.fn((modelId: string, _providerId?: string, endpoint?: string) => ({
    id: OLLAMA_WELL_KNOWN_PROVIDER_ID,
    name: 'ollama',
    type: 'text',
    endpoint: endpoint ?? DEFAULT_OLLAMA_BASE_URL,
    modelId,
    isLocal: true,
    capabilities: ['chat', 'streaming'],
    providerClass: 'local_text',
  })),
);

vi.mock('../src/bootstrap', () => ({
  OLLAMA_WELL_KNOWN_PROVIDER_ID,
  buildOllamaProviderConfig: buildOllamaProviderConfigMock,
  upsertProviderConfig: upsertProviderConfigMock,
}));

vi.mock('../src/ollama-detection', () => ({
  pullOllamaModel: vi.fn(),
  deleteOllamaModel: vi.fn(),
}));

vi.mock('../src/ollama-config', async () => {
  const actual = await vi.importActual<typeof import('../src/ollama-config')>('../src/ollama-config');
  return actual;
});

function createMockContext(providers?: Array<Record<string, unknown>>) {
  return {
    config: {
      get: () => ({
        providers: providers ?? [],
      }),
      update: vi.fn(),
    },
    eventBus: {
      publish: vi.fn(),
    },
    providerRegistry: {
      registerProvider: vi.fn(),
    },
    documentStore: {
      query: vi.fn(),
    },
    healthAggregator: {
      getSystemStatus: vi.fn(),
      getProviderHealth: vi.fn(),
      getAgentStatus: vi.fn(),
    },
  } as any;
}

// Import after mocks are set up
const { ollamaRouter } = await import('../src/trpc/routers/ollama');
const { createCallerFactory } = await import('../src/trpc/trpc').then(async (mod) => {
  // We need to use the router directly via tRPC's createCaller pattern
  // For unit testing, we'll call the procedures more directly
  return mod;
}).catch(() => ({ createCallerFactory: null }));

// Direct procedure testing approach — create a caller from the router
import { initTRPC } from '@trpc/server';

const t = initTRPC.context<any>().create();

describe('ollama.getEndpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns default endpoint when no Ollama provider is configured', async () => {
    const ctx = createMockContext([]);
    const caller = t.createCallerFactory(ollamaRouter)(ctx);
    const result = await caller.getEndpoint();
    expect(result).toEqual({ endpoint: DEFAULT_OLLAMA_BASE_URL });
  });

  it('returns default endpoint when Ollama provider has no endpoint', async () => {
    const ctx = createMockContext([
      { id: OLLAMA_WELL_KNOWN_PROVIDER_ID, isLocal: true },
    ]);
    const caller = t.createCallerFactory(ollamaRouter)(ctx);
    const result = await caller.getEndpoint();
    expect(result).toEqual({ endpoint: DEFAULT_OLLAMA_BASE_URL });
  });

  it('returns custom endpoint when provider has one', async () => {
    const ctx = createMockContext([
      { id: OLLAMA_WELL_KNOWN_PROVIDER_ID, isLocal: true, endpoint: 'http://custom:8080' },
    ]);
    const caller = t.createCallerFactory(ollamaRouter)(ctx);
    const result = await caller.getEndpoint();
    expect(result).toEqual({ endpoint: 'http://custom:8080' });
  });
});

describe('ollama.setEndpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertProviderConfigMock.mockResolvedValue(undefined);
  });

  it('persists valid URL via upsertProviderConfig and returns success', async () => {
    const ctx = createMockContext([
      { id: OLLAMA_WELL_KNOWN_PROVIDER_ID, isLocal: true, modelId: 'llama3' },
    ]);
    const caller = t.createCallerFactory(ollamaRouter)(ctx);
    const result = await caller.setEndpoint({ endpoint: 'http://custom:8080' });

    expect(result).toEqual({ success: true });
    expect(upsertProviderConfigMock).toHaveBeenCalledOnce();
    const config = upsertProviderConfigMock.mock.calls[0][1];
    expect(config.endpoint).toBe('http://custom:8080');
  });

  it('with null clears the endpoint override (reset to default)', async () => {
    const ctx = createMockContext([
      { id: OLLAMA_WELL_KNOWN_PROVIDER_ID, isLocal: true, endpoint: 'http://custom:8080', modelId: 'llama3' },
    ]);
    const caller = t.createCallerFactory(ollamaRouter)(ctx);
    const result = await caller.setEndpoint({ endpoint: null });

    expect(result).toEqual({ success: true });
    expect(upsertProviderConfigMock).toHaveBeenCalledOnce();
    const config = upsertProviderConfigMock.mock.calls[0][1];
    expect(config.endpoint).toBe(DEFAULT_OLLAMA_BASE_URL);
  });

  it('rejects invalid URL with Zod validation error', async () => {
    const ctx = createMockContext([]);
    const caller = t.createCallerFactory(ollamaRouter)(ctx);

    await expect(
      caller.setEndpoint({ endpoint: 'not-a-url' }),
    ).rejects.toThrow();
  });

  it('round-trip: set custom then get returns custom, then reset then get returns default', async () => {
    const providers: Array<Record<string, unknown>> = [
      { id: OLLAMA_WELL_KNOWN_PROVIDER_ID, isLocal: true, modelId: 'llama3' },
    ];

    // Set custom endpoint
    let ctx = createMockContext(providers);
    upsertProviderConfigMock.mockImplementation(async (_ctx: any, config: any) => {
      providers[0] = { ...providers[0], ...config };
    });

    let caller = t.createCallerFactory(ollamaRouter)(ctx);
    await caller.setEndpoint({ endpoint: 'http://custom:9999' });

    // Get — should return custom
    ctx = createMockContext(providers);
    caller = t.createCallerFactory(ollamaRouter)(ctx);
    const afterSet = await caller.getEndpoint();
    expect(afterSet.endpoint).toBe('http://custom:9999');

    // Reset
    ctx = createMockContext(providers);
    caller = t.createCallerFactory(ollamaRouter)(ctx);
    await caller.setEndpoint({ endpoint: null });

    // Get — should return default
    ctx = createMockContext(providers);
    caller = t.createCallerFactory(ollamaRouter)(ctx);
    const afterReset = await caller.getEndpoint();
    expect(afterReset.endpoint).toBe(DEFAULT_OLLAMA_BASE_URL);
  });
});
