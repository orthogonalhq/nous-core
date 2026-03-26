import { describe, expect, it, vi } from 'vitest';
import type {
  IHealthAggregator,
  SystemStatusSnapshot,
  AgentStatusSnapshot,
} from '@nous/shared';

// Provide BacklogEntryStatusSchema inline to avoid worktree resolution issues
vi.mock('@nous/cortex-core', async () => {
  const { z } = await import('zod');
  return {
    BacklogEntryStatusSchema: z.enum(['queued', 'active', 'suspended', 'completed', 'failed']),
  };
});
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
      queuedCount: 2,
      activeCount: 1,
      suspendedCount: 0,
      completedInWindow: 5,
      failedInWindow: 0,
      pressureTrend: 'stable',
    },
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
    ],
    appSessions: [],
    collectedAt: NOW,
  };
}

function createMockBacklogEntries() {
  return [
    {
      id: 'entry-1',
      status: 'queued' as const,
      source: 'scheduler' as const,
      priority: 'normal' as const,
      priorityRank: 1,
      instructions: 'task-1',
      payload: {},
      dispatchRef: 'dispatch-1',
      runId: 'run-1',
      acceptedAt: '2026-03-25T11:00:00.000Z',
      queueDepthAtAcceptance: 0,
    },
  ];
}

function createMockEscalationAuditSummary() {
  return {
    escalationCount: 3,
    lastEscalationAt: NOW,
    lastEscalationSeverity: 'high',
  };
}

function createMockCheckpointStatus() {
  return {
    lastPreparedCheckpointId: 'cp-001',
    lastCommittedCheckpointId: 'cp-001',
    chainValid: true,
  };
}

function createMockHealthAggregator(): IHealthAggregator {
  return {
    getSystemStatus: vi.fn().mockReturnValue(createMockSystemStatus()),
    getProviderHealth: vi.fn().mockReturnValue({ providers: [], collectedAt: NOW }),
    getAgentStatus: vi.fn().mockReturnValue(createMockAgentStatus()),
    dispose: vi.fn(),
  };
}

function createMockGatewayRuntime() {
  return {
    listBacklogEntries: vi.fn().mockResolvedValue(createMockBacklogEntries()),
    getEscalationAuditSummary: vi.fn().mockReturnValue(createMockEscalationAuditSummary()),
    getCheckpointStatus: vi.fn().mockReturnValue(createMockCheckpointStatus()),
    // Other IPrincipalSystemGatewayRuntime methods (not used by systemActivity router)
    getPrincipalGateway: vi.fn(),
    getSystemGateway: vi.fn(),
    getBootSnapshot: vi.fn(),
    getGatewayHealth: vi.fn(),
    getSystemContextReplica: vi.fn(),
    listPrincipalTools: vi.fn().mockReturnValue([]),
    listSystemTools: vi.fn().mockReturnValue([]),
    submitTaskToSystem: vi.fn(),
    injectDirectiveToSystem: vi.fn(),
    submitIngressEnvelope: vi.fn(),
    notifyLeaseReleased: vi.fn(),
    whenIdle: vi.fn(),
  };
}

function createMockContext(
  healthAggregator: IHealthAggregator,
  gatewayRuntime: ReturnType<typeof createMockGatewayRuntime>,
) {
  return {
    healthAggregator,
    gatewayRuntime,
    documentStore: {
      query: vi.fn().mockResolvedValue([]),
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
    config: {
      get: vi.fn().mockReturnValue({ providers: [] }),
    },
    // Minimal stubs for other NousContext fields
    coreExecutor: {},
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

describe('systemActivity tRPC router', () => {
  async function getCaller(ctx: any) {
    const { systemActivityRouter } = await import('../src/trpc/routers/system-activity.js');
    const { router: createRouter } = await import('../src/trpc/trpc.js');
    const testRouter = createRouter({ systemActivity: systemActivityRouter });
    return testRouter.createCaller(ctx);
  }

  describe('systemActivity.backlogEntries', () => {
    it('returns entries from gatewayRuntime.listBacklogEntries()', async () => {
      const aggregator = createMockHealthAggregator();
      const runtime = createMockGatewayRuntime();
      const ctx = createMockContext(aggregator, runtime);
      const caller = await getCaller(ctx);

      const result = await caller.systemActivity.backlogEntries();

      expect(result).toEqual(createMockBacklogEntries());
      expect(runtime.listBacklogEntries).toHaveBeenCalledOnce();
    });

    it('accepts optional status filter', async () => {
      const aggregator = createMockHealthAggregator();
      const runtime = createMockGatewayRuntime();
      const ctx = createMockContext(aggregator, runtime);
      const caller = await getCaller(ctx);

      await caller.systemActivity.backlogEntries({ status: 'queued' });

      expect(runtime.listBacklogEntries).toHaveBeenCalledWith({ status: 'queued' });
    });
  });

  describe('systemActivity.backlogAnalytics', () => {
    it('returns analytics from healthAggregator.getSystemStatus()', async () => {
      const aggregator = createMockHealthAggregator();
      const runtime = createMockGatewayRuntime();
      const ctx = createMockContext(aggregator, runtime);
      const caller = await getCaller(ctx);

      const result = await caller.systemActivity.backlogAnalytics();

      expect(result).toEqual(createMockSystemStatus().backlogAnalytics);
      expect(aggregator.getSystemStatus).toHaveBeenCalledOnce();
    });
  });

  describe('systemActivity.systemStatus', () => {
    it('returns snapshot from healthAggregator.getSystemStatus()', async () => {
      const aggregator = createMockHealthAggregator();
      const runtime = createMockGatewayRuntime();
      const ctx = createMockContext(aggregator, runtime);
      const caller = await getCaller(ctx);

      const result = await caller.systemActivity.systemStatus();

      expect(result).toEqual(createMockSystemStatus());
      expect(aggregator.getSystemStatus).toHaveBeenCalled();
    });
  });

  describe('systemActivity.gatewayHealth', () => {
    it('returns snapshot from healthAggregator.getAgentStatus()', async () => {
      const aggregator = createMockHealthAggregator();
      const runtime = createMockGatewayRuntime();
      const ctx = createMockContext(aggregator, runtime);
      const caller = await getCaller(ctx);

      const result = await caller.systemActivity.gatewayHealth();

      expect(result).toEqual(createMockAgentStatus());
      expect(aggregator.getAgentStatus).toHaveBeenCalledOnce();
    });
  });

  describe('systemActivity.escalationAudit', () => {
    it('returns summary from gatewayRuntime.getEscalationAuditSummary()', async () => {
      const aggregator = createMockHealthAggregator();
      const runtime = createMockGatewayRuntime();
      const ctx = createMockContext(aggregator, runtime);
      const caller = await getCaller(ctx);

      const result = await caller.systemActivity.escalationAudit();

      expect(result).toEqual(createMockEscalationAuditSummary());
      expect(runtime.getEscalationAuditSummary).toHaveBeenCalledOnce();
    });
  });

  describe('systemActivity.checkpointStatus', () => {
    it('returns status from gatewayRuntime.getCheckpointStatus()', async () => {
      const aggregator = createMockHealthAggregator();
      const runtime = createMockGatewayRuntime();
      const ctx = createMockContext(aggregator, runtime);
      const caller = await getCaller(ctx);

      const result = await caller.systemActivity.checkpointStatus();

      expect(result).toEqual(createMockCheckpointStatus());
      expect(runtime.getCheckpointStatus).toHaveBeenCalledOnce();
    });
  });
});
