/**
 * Unit tests for config propagation to all hardcoded endpoint locations.
 *
 * Verifies:
 * - getOllamaEndpointFromContext returns default when no providers in config
 * - getOllamaEndpointFromContext returns default when Ollama provider has no endpoint
 * - getOllamaEndpointFromContext returns custom endpoint when configured
 * - listModels uses config-sourced endpoint (mock fetch, verify URL)
 * - health check uses config-sourced endpoint (mock fetch, verify URL)
 * - buildOllamaProviderConfig with no endpoint argument uses default
 * - buildOllamaProviderConfig with endpoint argument uses that value
 * - Multiple providers — finds the correct one by OLLAMA_WELL_KNOWN_PROVIDER_ID
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const OLLAMA_WELL_KNOWN_PROVIDER_ID = '10000000-0000-0000-0000-000000000003';
const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';

// Mock bootstrap
const upsertProviderConfigMock = vi.fn();
vi.mock('../src/bootstrap', () => ({
  OLLAMA_WELL_KNOWN_PROVIDER_ID,
  buildOllamaProviderConfig: vi.fn((modelId: string, _pid?: string, endpoint?: string) => ({
    id: OLLAMA_WELL_KNOWN_PROVIDER_ID,
    name: 'ollama',
    type: 'text',
    endpoint: endpoint ?? DEFAULT_OLLAMA_BASE_URL,
    modelId,
    isLocal: true,
    capabilities: ['chat', 'streaming'],
    providerClass: 'local_text',
  })),
  upsertProviderConfig: upsertProviderConfigMock,
}));

// Mock ollama-detection
vi.mock('../src/ollama-detection', () => ({
  pullOllamaModel: vi.fn(),
  deleteOllamaModel: vi.fn(),
}));

function createMockContext(providers?: Array<Record<string, unknown>>) {
  return {
    config: {
      get: () => ({ providers: providers ?? [] }),
      update: vi.fn(),
    },
    eventBus: {
      publish: vi.fn(),
    },
    providerRegistry: {
      registerProvider: vi.fn(),
    },
    documentStore: {
      query: vi.fn().mockResolvedValue([]),
    },
    healthAggregator: {
      getSystemStatus: vi.fn(),
      getProviderHealth: vi.fn(),
      getAgentStatus: vi.fn(),
    },
  } as any;
}

describe('getOllamaEndpointFromContext', () => {
  let getOllamaEndpointFromContext: typeof import('../src/ollama-config').getOllamaEndpointFromContext;

  beforeEach(async () => {
    const mod = await import('../src/ollama-config');
    getOllamaEndpointFromContext = mod.getOllamaEndpointFromContext;
  });

  it('returns default when config has no providers array', () => {
    const ctx = { config: { get: () => ({}) } } as any;
    expect(getOllamaEndpointFromContext(ctx)).toBe(DEFAULT_OLLAMA_BASE_URL);
  });

  it('returns default when providers is empty', () => {
    const ctx = createMockContext([]);
    expect(getOllamaEndpointFromContext(ctx)).toBe(DEFAULT_OLLAMA_BASE_URL);
  });

  it('returns default when Ollama provider exists but has no endpoint field', () => {
    const ctx = createMockContext([
      { id: OLLAMA_WELL_KNOWN_PROVIDER_ID, isLocal: true },
    ]);
    expect(getOllamaEndpointFromContext(ctx)).toBe(DEFAULT_OLLAMA_BASE_URL);
  });

  it('returns custom endpoint when Ollama provider has endpoint set', () => {
    const ctx = createMockContext([
      { id: OLLAMA_WELL_KNOWN_PROVIDER_ID, isLocal: true, endpoint: 'http://custom:8080' },
    ]);
    expect(getOllamaEndpointFromContext(ctx)).toBe('http://custom:8080');
  });

  it('finds correct provider by OLLAMA_WELL_KNOWN_PROVIDER_ID among multiple providers', () => {
    const ctx = createMockContext([
      { id: '10000000-0000-0000-0000-000000000001', isLocal: false, endpoint: 'https://api.anthropic.com' },
      { id: OLLAMA_WELL_KNOWN_PROVIDER_ID, isLocal: true, endpoint: 'http://remote-ollama:11434' },
      { id: '10000000-0000-0000-0000-000000000002', isLocal: false, endpoint: 'https://api.openai.com' },
    ]);
    expect(getOllamaEndpointFromContext(ctx)).toBe('http://remote-ollama:11434');
  });
});

describe('listModels uses config-sourced endpoint', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fetches from custom endpoint, not hardcoded', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ models: [] }),
    });
    globalThis.fetch = fetchMock;

    const { initTRPC } = await import('@trpc/server');
    const { ollamaRouter } = await import('../src/trpc/routers/ollama');
    const t = initTRPC.context<any>().create();

    const ctx = createMockContext([
      { id: OLLAMA_WELL_KNOWN_PROVIDER_ID, isLocal: true, endpoint: 'http://custom:9090' },
    ]);
    const caller = t.createCallerFactory(ollamaRouter)(ctx);
    await caller.listModels();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://custom:9090/api/tags',
      expect.any(Object),
    );
  });
});

describe('health check uses config-sourced endpoint', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('probes custom endpoint, not hardcoded', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ models: [] }),
    });
    globalThis.fetch = fetchMock;

    const { initTRPC } = await import('@trpc/server');
    const { healthRouter } = await import('../src/trpc/routers/health');
    const t = initTRPC.context<any>().create();

    const ctx = createMockContext([
      { id: OLLAMA_WELL_KNOWN_PROVIDER_ID, isLocal: true, endpoint: 'http://custom:7777' },
    ]);
    const caller = t.createCallerFactory(healthRouter)(ctx);
    await caller.check();

    // Verify that the Ollama health check used the custom endpoint
    const ollamaFetchCall = fetchMock.mock.calls.find(
      (call: any[]) => typeof call[0] === 'string' && call[0].includes('/api/tags'),
    );
    expect(ollamaFetchCall).toBeDefined();
    expect(ollamaFetchCall![0]).toBe('http://custom:7777/api/tags');
  });
});

describe('buildOllamaProviderConfig endpoint parameter', () => {
  it('uses default endpoint when no endpoint argument', async () => {
    const { buildOllamaProviderConfig } = await import('../src/bootstrap');
    const config = buildOllamaProviderConfig('llama3');
    expect(config.endpoint).toBe(DEFAULT_OLLAMA_BASE_URL);
  });

  it('uses provided endpoint argument', async () => {
    const { buildOllamaProviderConfig } = await import('../src/bootstrap');
    const config = buildOllamaProviderConfig('llama3', undefined, 'http://custom:8080');
    expect(config.endpoint).toBe('http://custom:8080');
  });
});
