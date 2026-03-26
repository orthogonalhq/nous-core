import { describe, expect, it, vi } from 'vitest';
import type {
  IHealthAggregator,
  SystemStatusSnapshot,
  ProviderHealthSnapshot,
  AgentStatusSnapshot,
} from '@nous/shared';

/**
 * Mock all router dependencies so we can isolate the health router.
 * The health router only needs ctx.healthAggregator and ctx.documentStore/ctx.config
 * (for the existing `check` procedure).
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

const NOW = '2026-03-25T12:00:00.000Z';

function createMockSystemStatus(): SystemStatusSnapshot {
  return {
    bootStatus: 'ready',
    completedBootSteps: ['subcortex_initialized', 'principal_booted'],
    issueCodes: [],
    inboxReady: true,
    pendingSystemRuns: 0,
    backlogAnalytics: {
      queuedCount: 0,
      activeCount: 0,
      suspendedCount: 0,
      completedInWindow: 5,
      failedInWindow: 0,
      pressureTrend: 'idle',
    },
    collectedAt: NOW,
  };
}

function createMockProviderHealth(): ProviderHealthSnapshot {
  return {
    providers: [
      {
        providerId: '10000000-0000-0000-0000-000000000001',
        name: 'anthropic',
        type: 'cloud',
        isLocal: false,
        endpoint: 'https://api.anthropic.com',
        status: 'unknown',
        modelId: 'claude-sonnet-4-20250514',
      },
    ],
    collectedAt: NOW,
  };
}

function createMockAgentStatus(): AgentStatusSnapshot {
  return {
    gateways: [
      {
        agentClass: 'Cortex::Principal',
        agentId: '00000000-0000-0000-0000-000000000001',
        inboxReady: true,
        visibleToolCount: 5,
        lastAckAt: NOW,
        lastObservationAt: NOW,
        lastSubmissionAt: undefined,
        lastResultStatus: undefined,
        issueCount: 0,
        issueCodes: [],
      },
      {
        agentClass: 'Cortex::System',
        agentId: '00000000-0000-0000-0000-000000000002',
        inboxReady: true,
        visibleToolCount: 3,
        lastAckAt: NOW,
        lastObservationAt: undefined,
        lastSubmissionAt: undefined,
        lastResultStatus: undefined,
        issueCount: 0,
        issueCodes: [],
      },
    ],
    appSessions: [],
    collectedAt: NOW,
  };
}

function createMockHealthAggregator(): IHealthAggregator {
  return {
    getSystemStatus: vi.fn().mockReturnValue(createMockSystemStatus()),
    getProviderHealth: vi.fn().mockReturnValue(createMockProviderHealth()),
    getAgentStatus: vi.fn().mockReturnValue(createMockAgentStatus()),
    dispose: vi.fn(),
  };
}

function createMockContext(healthAggregator: IHealthAggregator) {
  return {
    healthAggregator,
    documentStore: {
      query: vi.fn().mockResolvedValue([]),
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
    config: {
      get: vi.fn().mockReturnValue({ providers: [] }),
    },
    // Minimal stubs for other NousContext fields — not used by health procedures
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

describe('health tRPC router', () => {
  // We import the router lazily to allow mocks to take effect
  async function getCaller(ctx: any) {
    const { healthRouter } = await import('../src/trpc/routers/health.js');
    const { router: createRouter } = await import('../src/trpc/trpc.js');
    const testRouter = createRouter({ health: healthRouter });
    return testRouter.createCaller(ctx);
  }

  describe('health.systemStatus', () => {
    it('returns a valid SystemStatusSnapshot from the aggregator', async () => {
      const aggregator = createMockHealthAggregator();
      const ctx = createMockContext(aggregator);
      const caller = await getCaller(ctx);

      const result = await caller.health.systemStatus();

      expect(result).toEqual(createMockSystemStatus());
      expect(aggregator.getSystemStatus).toHaveBeenCalledOnce();
    });

    it('returns correct bootStatus field', async () => {
      const aggregator = createMockHealthAggregator();
      const ctx = createMockContext(aggregator);
      const caller = await getCaller(ctx);

      const result = await caller.health.systemStatus();

      expect(result.bootStatus).toBe('ready');
      expect(result.inboxReady).toBe(true);
      expect(result.pendingSystemRuns).toBe(0);
    });

    it('returns backlogAnalytics sub-object with all required fields', async () => {
      const aggregator = createMockHealthAggregator();
      const ctx = createMockContext(aggregator);
      const caller = await getCaller(ctx);

      const result = await caller.health.systemStatus();

      expect(result.backlogAnalytics).toBeDefined();
      expect(result.backlogAnalytics).toHaveProperty('queuedCount');
      expect(result.backlogAnalytics).toHaveProperty('activeCount');
      expect(result.backlogAnalytics).toHaveProperty('suspendedCount');
      expect(result.backlogAnalytics).toHaveProperty('completedInWindow');
      expect(result.backlogAnalytics).toHaveProperty('failedInWindow');
      expect(result.backlogAnalytics).toHaveProperty('pressureTrend');
      expect(typeof result.backlogAnalytics.queuedCount).toBe('number');
      expect(typeof result.backlogAnalytics.activeCount).toBe('number');
      expect(typeof result.backlogAnalytics.suspendedCount).toBe('number');
      expect(typeof result.backlogAnalytics.completedInWindow).toBe('number');
      expect(typeof result.backlogAnalytics.failedInWindow).toBe('number');
      expect(typeof result.backlogAnalytics.pressureTrend).toBe('string');
    });
  });

  describe('health.providerHealth', () => {
    it('returns a valid ProviderHealthSnapshot from the aggregator', async () => {
      const aggregator = createMockHealthAggregator();
      const ctx = createMockContext(aggregator);
      const caller = await getCaller(ctx);

      const result = await caller.health.providerHealth();

      expect(result).toEqual(createMockProviderHealth());
      expect(aggregator.getProviderHealth).toHaveBeenCalledOnce();
    });

    it('returns provider entries with expected shape', async () => {
      const aggregator = createMockHealthAggregator();
      const ctx = createMockContext(aggregator);
      const caller = await getCaller(ctx);

      const result = await caller.health.providerHealth();

      expect(result.providers).toHaveLength(1);
      expect(result.providers[0]).toHaveProperty('providerId');
      expect(result.providers[0]).toHaveProperty('name');
      expect(result.providers[0]).toHaveProperty('status');
    });
  });

  describe('health.agentStatus', () => {
    it('returns a valid AgentStatusSnapshot from the aggregator', async () => {
      const aggregator = createMockHealthAggregator();
      const ctx = createMockContext(aggregator);
      const caller = await getCaller(ctx);

      const result = await caller.health.agentStatus();

      expect(result).toEqual(createMockAgentStatus());
      expect(aggregator.getAgentStatus).toHaveBeenCalledOnce();
    });

    it('returns exactly 2 gateway entries (Principal + System)', async () => {
      const aggregator = createMockHealthAggregator();
      const ctx = createMockContext(aggregator);
      const caller = await getCaller(ctx);

      const result = await caller.health.agentStatus();

      expect(result.gateways).toHaveLength(2);
      expect(result.gateways[0].agentClass).toBe('Cortex::Principal');
      expect(result.gateways[1].agentClass).toBe('Cortex::System');
    });
  });

  describe('health.check (backward compatibility)', () => {
    it('returns unchanged shape with healthy/components/timestamp fields', async () => {
      const aggregator = createMockHealthAggregator();
      const ctx = createMockContext(aggregator);
      const caller = await getCaller(ctx);

      const result = await caller.health.check();

      expect(result).toHaveProperty('healthy');
      expect(result).toHaveProperty('components');
      expect(result).toHaveProperty('timestamp');
      expect(typeof result.healthy).toBe('boolean');
      expect(Array.isArray(result.components)).toBe(true);
    });

    it('does not call healthAggregator (existing endpoint is independent)', async () => {
      const aggregator = createMockHealthAggregator();
      const ctx = createMockContext(aggregator);
      const caller = await getCaller(ctx);

      await caller.health.check();

      expect(aggregator.getSystemStatus).not.toHaveBeenCalled();
      expect(aggregator.getProviderHealth).not.toHaveBeenCalled();
      expect(aggregator.getAgentStatus).not.toHaveBeenCalled();
    });
  });
});
