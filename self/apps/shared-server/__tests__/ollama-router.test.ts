import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for the Ollama tRPC router (listModels, pullModel, deleteModel).
 *
 * Mocks global fetch for Ollama HTTP API calls and ctx.eventBus for SSE events.
 */

// Stub modules that other routers import to prevent resolution errors
vi.mock('@nous/cortex-core', () => ({}));
vi.mock('@nous/cortex-pfc', () => ({}));
vi.mock('@nous/subcortex-apps', () => ({}));
vi.mock('@nous/subcortex-artifacts', () => ({}));
vi.mock('@nous/subcortex-coding-agents', () => ({}));
vi.mock('@nous/subcortex-communication-gateway', () => ({}));
vi.mock('@nous/subcortex-endpoint-trust', () => ({}));
vi.mock('@nous/subcortex-escalation', () => ({}));
vi.mock('@nous/subcortex-gtm', () => ({}));
vi.mock('@nous/subcortex-mao', () => ({}));
vi.mock('@nous/subcortex-nudges', () => ({}));
vi.mock('@nous/subcortex-opctl', () => ({}));
vi.mock('@nous/subcortex-projects', () => ({}));
vi.mock('@nous/subcortex-providers', () => ({}));
vi.mock('@nous/subcortex-public-mcp', () => ({}));
vi.mock('@nous/subcortex-registry', () => ({}));
vi.mock('@nous/subcortex-router', () => ({}));
vi.mock('@nous/subcortex-scheduler', () => ({}));
vi.mock('@nous/subcortex-tools', () => ({}));
vi.mock('@nous/subcortex-voice-control', () => ({}));
vi.mock('@nous/subcortex-witnessd', () => ({}));
vi.mock('@nous/subcortex-workflows', () => ({}));
vi.mock('@nous/memory-access', () => ({}));
vi.mock('@nous/memory-knowledge-index', () => ({}));
vi.mock('@nous/memory-mwc', () => ({}));
vi.mock('@nous/memory-stm', () => ({}));
vi.mock('@nous/memory-distillation', () => ({}));
vi.mock('@nous/autonomic-config', () => ({}));
vi.mock('@nous/autonomic-credentials', () => ({}));
vi.mock('@nous/autonomic-embeddings', () => ({}));
vi.mock('@nous/autonomic-health', () => ({}));
vi.mock('@nous/autonomic-runtime', () => ({}));
vi.mock('@nous/autonomic-storage', () => ({}));

// Mock the ollama-detection module to isolate router logic
const mockPullOllamaModel = vi.fn();
const mockDeleteOllamaModel = vi.fn();

vi.mock('../src/ollama-detection', () => ({
  pullOllamaModel: mockPullOllamaModel,
  deleteOllamaModel: mockDeleteOllamaModel,
}));

function createMockContext() {
  return {
    healthAggregator: { getSystemStatus: vi.fn(), getProviderHealth: vi.fn(), getAgentStatus: vi.fn(), dispose: vi.fn() },
    documentStore: { query: vi.fn(), get: vi.fn(), put: vi.fn(), delete: vi.fn() },
    config: { get: vi.fn().mockReturnValue({ providers: [] }) },
    coreExecutor: {},
    gatewayRuntime: {},
    projectStore: {},
    stmStore: {},
    mwcPipeline: {},
    router: {},
    getProvider: () => null,
    witnessService: {},
    opctlService: {},
    maoProjectionService: {},
    gtmGateCalculator: {},
    knowledgeIndex: {},
    workflowEngine: {},
    artifactStore: {},
    schedulerService: {},
    escalationService: {},
    endpointTrustService: {},
    registryService: {},
    appInstallService: {},
    appSettingsService: {},
    packageInstallService: {},
    nudgeDiscoveryService: {},
    voiceControlService: {},
    publicMcpGatewayService: {},
    publicMcpExecutionBridge: {},
    appRuntimeService: {},
    credentialVaultService: {},
    providerRegistry: {},
    panelTranspiler: {},
    dataDir: '/tmp/test',
    codingAgentMaoEvents: [],
    agentSessions: new Map(),
    eventBus: { subscribe: vi.fn(), unsubscribe: vi.fn(), publish: vi.fn() },
    healthMonitor: { check: vi.fn(), getMetrics: vi.fn() },
  } as any;
}

describe('ollama tRPC router', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    mockPullOllamaModel.mockReset();
    mockDeleteOllamaModel.mockReset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  async function getCaller(ctx: any) {
    const { ollamaRouter } = await import('../src/trpc/routers/ollama.js');
    const { router: createRouter } = await import('../src/trpc/trpc.js');
    const testRouter = createRouter({ ollama: ollamaRouter });
    return testRouter.createCaller(ctx);
  }

  // ─── listModels ─────────────────────────────────────────────────────────────

  describe('ollama.listModels', () => {
    it('returns models when Ollama responds with a model list', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            models: [
              { name: 'llama3.2:3b', size: 2_000_000_000, modified_at: '2026-01-01T00:00:00Z' },
              { name: 'codellama:7b', size: 4_000_000_000, modified_at: '2026-02-01T00:00:00Z' },
            ],
          }),
      });

      const ctx = createMockContext();
      const caller = await getCaller(ctx);
      const result = await caller.ollama.listModels();

      expect(result.models).toHaveLength(2);
      expect(result.models[0]).toEqual({
        name: 'llama3.2:3b',
        size: 2_000_000_000,
        modifiedAt: '2026-01-01T00:00:00Z',
      });
      expect(result.models[1]).toEqual({
        name: 'codellama:7b',
        size: 4_000_000_000,
        modifiedAt: '2026-02-01T00:00:00Z',
      });
    });

    it('returns empty models when Ollama is unreachable', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('fetch failed'));

      const ctx = createMockContext();
      const caller = await getCaller(ctx);
      const result = await caller.ollama.listModels();

      expect(result.models).toEqual([]);
    });

    it('returns empty models when Ollama returns non-OK status', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const ctx = createMockContext();
      const caller = await getCaller(ctx);
      const result = await caller.ollama.listModels();

      expect(result.models).toEqual([]);
    });
  });

  // ─── pullModel ──────────────────────────────────────────────────────────────

  describe('ollama.pullModel', () => {
    it('calls pullOllamaModel and emits progress events via eventBus', async () => {
      mockPullOllamaModel.mockImplementation(async (_model: string, opts?: { onProgress?: (p: any) => void }) => {
        opts?.onProgress?.({
          status: 'downloading',
          digest: 'sha256:abc',
          total: 1000,
          completed: 500,
          percent: 50,
        });
      });

      const ctx = createMockContext();
      const caller = await getCaller(ctx);
      const result = await caller.ollama.pullModel({ model: 'llama3.2:3b' });

      expect(result).toEqual({ success: true });
      expect(mockPullOllamaModel).toHaveBeenCalledWith('llama3.2:3b', expect.objectContaining({ onProgress: expect.any(Function) }));
      expect(ctx.eventBus.publish).toHaveBeenCalledWith('ollama:pull-progress', {
        model: 'llama3.2:3b',
        status: 'downloading',
        digest: 'sha256:abc',
        total: 1000,
        completed: 500,
        percent: 50,
      });
    });

    it('throws when pullOllamaModel errors', async () => {
      mockPullOllamaModel.mockRejectedValue(new Error('pull failed'));

      const ctx = createMockContext();
      const caller = await getCaller(ctx);

      await expect(caller.ollama.pullModel({ model: 'bad-model' })).rejects.toThrow('pull failed');
    });
  });

  // ─── deleteModel ────────────────────────────────────────────────────────────

  describe('ollama.deleteModel', () => {
    it('calls deleteOllamaModel and returns success', async () => {
      mockDeleteOllamaModel.mockResolvedValue(undefined);

      const ctx = createMockContext();
      const caller = await getCaller(ctx);
      const result = await caller.ollama.deleteModel({ name: 'llama3.2:3b' });

      expect(result).toEqual({ success: true });
      expect(mockDeleteOllamaModel).toHaveBeenCalledWith('llama3.2:3b');
    });

    it('throws when deleteOllamaModel errors', async () => {
      mockDeleteOllamaModel.mockRejectedValue(new Error('delete failed'));

      const ctx = createMockContext();
      const caller = await getCaller(ctx);

      await expect(caller.ollama.deleteModel({ name: 'nonexistent' })).rejects.toThrow('delete failed');
    });
  });
});
