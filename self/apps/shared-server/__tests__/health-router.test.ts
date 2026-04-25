import { describe, expect, it, vi } from 'vitest';
import type {
  IHealthAggregator,
  SystemStatusSnapshot,
  ProviderHealthSnapshot,
  AgentStatusSnapshot,
  SupervisorStatusSnapshot,
  BudgetStatus,
  MaoSystemSnapshot,
} from '@nous/shared';
import { StatusBarSnapshotSchema } from '@nous/shared';

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
      pressureTrend: 'stable',
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

interface MockContextOverrides {
  supervisorService?: { getStatusSnapshot: () => Promise<SupervisorStatusSnapshot> };
  costGovernanceService?: { getBudgetStatus: (projectId: string) => BudgetStatus };
  maoProjectionService?: { getSystemSnapshot: (input: { densityMode: 'D1' | 'D2' | 'D3' }) => Promise<MaoSystemSnapshot> };
}

function createMockContext(
  healthAggregator: IHealthAggregator,
  overrides: MockContextOverrides = {},
) {
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
    maoProjectionService: overrides.maoProjectionService ?? {},
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
    supervisorService: overrides.supervisorService ?? {},
    costGovernanceService: overrides.costGovernanceService ?? {},
    notificationService: {},
    tokenAccumulator: {},
  } as any;
}

// ---------------------------------------------------------------------------
// WR-162 SP 11 — getStatusBarSnapshot fixtures.
// ---------------------------------------------------------------------------

const SP11_NOW = '2026-04-25T12:00:00.000Z';

function createMockSystemStatusForSP11(
  overrides: Partial<SystemStatusSnapshot['backlogAnalytics']> = {},
): SystemStatusSnapshot {
  return {
    bootStatus: 'ready',
    completedBootSteps: ['subcortex_initialized', 'principal_booted'],
    issueCodes: [],
    inboxReady: true,
    pendingSystemRuns: 0,
    backlogAnalytics: {
      queuedCount: 5,
      activeCount: 0,
      suspendedCount: 0,
      completedInWindow: 0,
      failedInWindow: 0,
      pressureTrend: 'stable',
      ...overrides,
    },
    collectedAt: SP11_NOW,
  };
}

function createMockSupervisorSnapshot(
  overrides: Partial<SupervisorStatusSnapshot> = {},
): SupervisorStatusSnapshot {
  return {
    active: true,
    agentsMonitored: 3,
    activeViolationCounts: { s0: 0, s1: 0, s2: 0, s3: 0 },
    lifetime: {
      violationsDetected: 0,
      anomaliesClassified: 0,
      enforcementsApplied: 0,
    },
    witnessIntegrity: {
      lastVerificationAt: SP11_NOW,
      tipDigest: 'tip',
      length: 0,
      verified: true,
    },
    riskSummary: {},
    reportedAt: SP11_NOW,
    ...overrides,
  };
}

function createMockBudgetStatus(overrides: Partial<BudgetStatus> = {}): BudgetStatus {
  return {
    hasBudget: true,
    currentSpendUsd: 14.7,
    budgetCeilingUsd: 20.0,
    utilizationPercent: 73.5,
    softAlertFired: false,
    hardCeilingFired: false,
    periodStart: '2026-04-01T00:00:00.000Z',
    periodEnd: '2026-04-30T23:59:59.000Z',
    projectControlState: 'running',
    ...overrides,
  };
}

function createMockMaoSnapshot(agentCount: number): MaoSystemSnapshot {
  // Only the `.agents.length` is read by `safeActiveAgents`; the array
  // contents are opaque for SP 11 purposes. Cast through `unknown` to
  // bypass the rich `MaoAgentProjection` shape (owned by SP 1 / SP 8).
  return {
    agents: Array.from({ length: agentCount }, () => ({}) as unknown) as MaoSystemSnapshot['agents'],
    leaseRoots: [],
    projectControls: {},
    densityMode: 'D2',
    generatedAt: SP11_NOW,
  };
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

  // =========================================================================
  // WR-162 SP 11 — getStatusBarSnapshot procedure + four `safe*` helpers.
  //
  // SUPV-SP11-012 — `safeBackpressure` closed-form try/catch + threshold ladder.
  // SUPV-SP11-013 — `safeCognitiveProfile` unconditional null (Decision #7 D.2).
  // SUPV-SP11-014 — `safeBudget` closed-form try/catch + threshold ladder.
  // SUPV-SP11-015 — `safeActiveAgents` closed-form try/catch.
  // SUPV-SP11-016 — only-if-all-four-fail four-clause AND throw threshold.
  // =========================================================================

  describe('health.getStatusBarSnapshot', () => {
    function makeAggregatorWithSystemStatus(status: SystemStatusSnapshot): IHealthAggregator {
      return {
        getSystemStatus: vi.fn().mockReturnValue(status),
        getProviderHealth: vi.fn().mockReturnValue(createMockProviderHealth()),
        getAgentStatus: vi.fn().mockReturnValue(createMockAgentStatus()),
        dispose: vi.fn(),
      };
    }

    it('UT-SP11-SAFE-BACKPRESSURE-HAPPY — returns nominal state with queueDepth + activeAgents', async () => {
      const ctx = createMockContext(
        makeAggregatorWithSystemStatus(createMockSystemStatusForSP11({ queuedCount: 5 })),
        {
          supervisorService: {
            getStatusSnapshot: vi
              .fn()
              .mockResolvedValue(createMockSupervisorSnapshot({ agentsMonitored: 3 })),
          },
          maoProjectionService: {
            getSystemSnapshot: vi.fn().mockResolvedValue(createMockMaoSnapshot(2)),
          },
        },
      );
      const caller = await getCaller(ctx);
      const result = await caller.health.getStatusBarSnapshot({});
      expect(result.backpressure).toEqual({ state: 'nominal', queueDepth: 5, activeAgents: 3 });
    });

    it('UT-SP11-SAFE-BACKPRESSURE-THROW — healthAggregator throw → backpressure null; other slots unaffected', async () => {
      const aggregator: IHealthAggregator = {
        getSystemStatus: vi.fn().mockImplementation(() => {
          throw new Error('boom');
        }),
        getProviderHealth: vi.fn().mockReturnValue(createMockProviderHealth()),
        getAgentStatus: vi.fn().mockReturnValue(createMockAgentStatus()),
        dispose: vi.fn(),
      };
      const ctx = createMockContext(aggregator, {
        supervisorService: {
          getStatusSnapshot: vi.fn().mockResolvedValue(createMockSupervisorSnapshot()),
        },
        maoProjectionService: {
          getSystemSnapshot: vi.fn().mockResolvedValue(createMockMaoSnapshot(1)),
        },
      });
      const caller = await getCaller(ctx);
      const result = await caller.health.getStatusBarSnapshot({});
      expect(result.backpressure).toBeNull();
      // Other slots are unaffected — activeAgents non-null because mao didn't throw.
      expect(result.activeAgents).not.toBeNull();
    });

    it('UT-SP11-SAFE-BACKPRESSURE-CRITICAL — s0 violation → state=critical', async () => {
      const ctx = createMockContext(
        makeAggregatorWithSystemStatus(createMockSystemStatusForSP11()),
        {
          supervisorService: {
            getStatusSnapshot: vi.fn().mockResolvedValue(
              createMockSupervisorSnapshot({
                activeViolationCounts: { s0: 1, s1: 0, s2: 0, s3: 0 },
              }),
            ),
          },
          maoProjectionService: {
            getSystemSnapshot: vi.fn().mockResolvedValue(createMockMaoSnapshot(0)),
          },
        },
      );
      const caller = await getCaller(ctx);
      const result = await caller.health.getStatusBarSnapshot({});
      expect(result.backpressure?.state).toBe('critical');
    });

    it('UT-SP11-SAFE-BACKPRESSURE-ELEVATED — s1 violation OR rising-equivalent → state=elevated', async () => {
      // s1 violation
      const ctx1 = createMockContext(
        makeAggregatorWithSystemStatus(createMockSystemStatusForSP11()),
        {
          supervisorService: {
            getStatusSnapshot: vi.fn().mockResolvedValue(
              createMockSupervisorSnapshot({
                activeViolationCounts: { s0: 0, s1: 1, s2: 0, s3: 0 },
              }),
            ),
          },
          maoProjectionService: {
            getSystemSnapshot: vi.fn().mockResolvedValue(createMockMaoSnapshot(0)),
          },
        },
      );
      const caller1 = await getCaller(ctx1);
      const result1 = await caller1.health.getStatusBarSnapshot({});
      expect(result1.backpressure?.state).toBe('elevated');

      // pressureTrend === 'increasing' (the verified field-name; SDS used
      // 'rising' which doesn't exist on the schema)
      const ctx2 = createMockContext(
        makeAggregatorWithSystemStatus(
          createMockSystemStatusForSP11({ pressureTrend: 'increasing' }),
        ),
        {
          supervisorService: {
            getStatusSnapshot: vi.fn().mockResolvedValue(createMockSupervisorSnapshot()),
          },
          maoProjectionService: {
            getSystemSnapshot: vi.fn().mockResolvedValue(createMockMaoSnapshot(0)),
          },
        },
      );
      const caller2 = await getCaller(ctx2);
      const result2 = await caller2.health.getStatusBarSnapshot({});
      expect(result2.backpressure?.state).toBe('elevated');
    });

    it('UT-SP11-SAFE-COGNITIVE-NULL — cognitiveProfile is null and ctx is never accessed for that slot', async () => {
      // Build a Proxy that throws on every property read; pass it via the
      // wider ctx. `safeCognitiveProfile`'s body must NOT touch ctx (Decision
      // #7 Option D.2). The whole-procedure can still construct because
      // safeCognitiveProfile uses `_ctx`/`_projectId` and never reads them.
      let cognitiveCtxAccessed = false;
      const realCtx = createMockContext(
        makeAggregatorWithSystemStatus(createMockSystemStatusForSP11()),
        {
          supervisorService: {
            getStatusSnapshot: vi.fn().mockResolvedValue(createMockSupervisorSnapshot()),
          },
          maoProjectionService: {
            getSystemSnapshot: vi.fn().mockResolvedValue(createMockMaoSnapshot(1)),
          },
        },
      );
      // Wrap the ctx in a Proxy that flags any access path that mentions
      // 'cognitive' or 'profile'. (The `safe*` helpers do NOT route through
      // such a path; the assertion is that no such handle is read.)
      const trapped = new Proxy(realCtx, {
        get(target, prop) {
          if (typeof prop === 'string' && /cognitive|profile/i.test(prop)) {
            cognitiveCtxAccessed = true;
          }
          return Reflect.get(target, prop);
        },
      });
      const caller = await getCaller(trapped);
      const result = await caller.health.getStatusBarSnapshot({ projectId: 'project-1' });
      expect(result.cognitiveProfile).toBeNull();
      expect(cognitiveCtxAccessed).toBe(false);
    });

    it('UT-SP11-SAFE-BUDGET-HAPPY — nominal: ratio < 75%, no alerts → state=nominal', async () => {
      const ctx = createMockContext(
        makeAggregatorWithSystemStatus(createMockSystemStatusForSP11()),
        {
          supervisorService: {
            getStatusSnapshot: vi.fn().mockResolvedValue(createMockSupervisorSnapshot()),
          },
          costGovernanceService: {
            getBudgetStatus: vi.fn().mockReturnValue(createMockBudgetStatus({ utilizationPercent: 73.5 })),
          },
          maoProjectionService: {
            getSystemSnapshot: vi.fn().mockResolvedValue(createMockMaoSnapshot(0)),
          },
        },
      );
      const caller = await getCaller(ctx);
      const result = await caller.health.getStatusBarSnapshot({ projectId: 'project-1' });
      expect(result.budget).toEqual({
        state: 'nominal',
        spent: 14.7,
        ceiling: 20,
        period: '2026-04-01T00:00:00.000Z',
      });
    });

    it('UT-SP11-SAFE-BUDGET-THRESHOLDS — exceeded / caution / warning ladder', async () => {
      // exceeded
      const ctx1 = createMockContext(
        makeAggregatorWithSystemStatus(createMockSystemStatusForSP11()),
        {
          supervisorService: {
            getStatusSnapshot: vi.fn().mockResolvedValue(createMockSupervisorSnapshot()),
          },
          costGovernanceService: {
            getBudgetStatus: vi
              .fn()
              .mockReturnValue(createMockBudgetStatus({ hardCeilingFired: true })),
          },
          maoProjectionService: {
            getSystemSnapshot: vi.fn().mockResolvedValue(createMockMaoSnapshot(0)),
          },
        },
      );
      const caller1 = await getCaller(ctx1);
      expect((await caller1.health.getStatusBarSnapshot({ projectId: 'p' })).budget?.state).toBe(
        'exceeded',
      );

      // caution
      const ctx2 = createMockContext(
        makeAggregatorWithSystemStatus(createMockSystemStatusForSP11()),
        {
          supervisorService: {
            getStatusSnapshot: vi.fn().mockResolvedValue(createMockSupervisorSnapshot()),
          },
          costGovernanceService: {
            getBudgetStatus: vi
              .fn()
              .mockReturnValue(createMockBudgetStatus({ softAlertFired: true })),
          },
          maoProjectionService: {
            getSystemSnapshot: vi.fn().mockResolvedValue(createMockMaoSnapshot(0)),
          },
        },
      );
      const caller2 = await getCaller(ctx2);
      expect((await caller2.health.getStatusBarSnapshot({ projectId: 'p' })).budget?.state).toBe(
        'caution',
      );

      // warning (>= 75%)
      const ctx3 = createMockContext(
        makeAggregatorWithSystemStatus(createMockSystemStatusForSP11()),
        {
          supervisorService: {
            getStatusSnapshot: vi.fn().mockResolvedValue(createMockSupervisorSnapshot()),
          },
          costGovernanceService: {
            getBudgetStatus: vi
              .fn()
              .mockReturnValue(createMockBudgetStatus({ utilizationPercent: 80 })),
          },
          maoProjectionService: {
            getSystemSnapshot: vi.fn().mockResolvedValue(createMockMaoSnapshot(0)),
          },
        },
      );
      const caller3 = await getCaller(ctx3);
      expect((await caller3.health.getStatusBarSnapshot({ projectId: 'p' })).budget?.state).toBe(
        'warning',
      );
    });

    it('UT-SP11-SAFE-BUDGET-NO-PROJECT — projectId undefined → budget null and getBudgetStatus is not called', async () => {
      const getBudgetStatus = vi.fn();
      const ctx = createMockContext(
        makeAggregatorWithSystemStatus(createMockSystemStatusForSP11()),
        {
          supervisorService: {
            getStatusSnapshot: vi.fn().mockResolvedValue(createMockSupervisorSnapshot()),
          },
          costGovernanceService: { getBudgetStatus },
          maoProjectionService: {
            getSystemSnapshot: vi.fn().mockResolvedValue(createMockMaoSnapshot(1)),
          },
        },
      );
      const caller = await getCaller(ctx);
      const result = await caller.health.getStatusBarSnapshot({});
      expect(result.budget).toBeNull();
      expect(getBudgetStatus).not.toHaveBeenCalled();
    });

    it('UT-SP11-SAFE-AGENTS-HAPPY — count > 0 → status=active; count = 0 → status=idle', async () => {
      // active (3 agents)
      const ctx1 = createMockContext(
        makeAggregatorWithSystemStatus(createMockSystemStatusForSP11()),
        {
          supervisorService: {
            getStatusSnapshot: vi.fn().mockResolvedValue(createMockSupervisorSnapshot()),
          },
          maoProjectionService: {
            getSystemSnapshot: vi.fn().mockResolvedValue(createMockMaoSnapshot(3)),
          },
        },
      );
      const caller1 = await getCaller(ctx1);
      const result1 = await caller1.health.getStatusBarSnapshot({});
      expect(result1.activeAgents).toEqual({ count: 3, status: 'active' });

      // idle (0 agents)
      const ctx2 = createMockContext(
        makeAggregatorWithSystemStatus(createMockSystemStatusForSP11()),
        {
          supervisorService: {
            getStatusSnapshot: vi.fn().mockResolvedValue(createMockSupervisorSnapshot()),
          },
          maoProjectionService: {
            getSystemSnapshot: vi.fn().mockResolvedValue(createMockMaoSnapshot(0)),
          },
        },
      );
      const caller2 = await getCaller(ctx2);
      const result2 = await caller2.health.getStatusBarSnapshot({});
      expect(result2.activeAgents).toEqual({ count: 0, status: 'idle' });
    });

    it('UT-SP11-SAFE-BUDGET-NO-HASBUDGET — hasBudget=false → budget null even with valid projectId', async () => {
      const ctx = createMockContext(
        makeAggregatorWithSystemStatus(createMockSystemStatusForSP11()),
        {
          supervisorService: {
            getStatusSnapshot: vi.fn().mockResolvedValue(createMockSupervisorSnapshot()),
          },
          costGovernanceService: {
            getBudgetStatus: vi
              .fn()
              .mockReturnValue(createMockBudgetStatus({ hasBudget: false })),
          },
          maoProjectionService: {
            getSystemSnapshot: vi.fn().mockResolvedValue(createMockMaoSnapshot(0)),
          },
        },
      );
      const caller = await getCaller(ctx);
      const result = await caller.health.getStatusBarSnapshot({ projectId: 'project-1' });
      expect(result.budget).toBeNull();
    });

    it('UT-SP11-SAFE-BUDGET-THROW — costGovernanceService throw → budget null', async () => {
      const ctx = createMockContext(
        makeAggregatorWithSystemStatus(createMockSystemStatusForSP11()),
        {
          supervisorService: {
            getStatusSnapshot: vi.fn().mockResolvedValue(createMockSupervisorSnapshot()),
          },
          costGovernanceService: {
            getBudgetStatus: vi.fn().mockImplementation(() => {
              throw new Error('budget boom');
            }),
          },
          maoProjectionService: {
            getSystemSnapshot: vi.fn().mockResolvedValue(createMockMaoSnapshot(1)),
          },
        },
      );
      const caller = await getCaller(ctx);
      const result = await caller.health.getStatusBarSnapshot({ projectId: 'project-1' });
      expect(result.budget).toBeNull();
    });

    it('UT-SP11-SAFE-AGENTS-THROW — maoProjectionService throw → activeAgents null', async () => {
      const ctx = createMockContext(
        makeAggregatorWithSystemStatus(createMockSystemStatusForSP11()),
        {
          supervisorService: {
            getStatusSnapshot: vi.fn().mockResolvedValue(createMockSupervisorSnapshot()),
          },
          maoProjectionService: {
            getSystemSnapshot: vi.fn().mockRejectedValue(new Error('mao boom')),
          },
        },
      );
      const caller = await getCaller(ctx);
      const result = await caller.health.getStatusBarSnapshot({});
      expect(result.activeAgents).toBeNull();
    });

    // ---- IT-SP11-SNAPSHOT-* integration tests ----

    it('IT-SP11-SNAPSHOT-FULL — all four sources happy → aggregate parses through StatusBarSnapshotSchema (cognitiveProfile structurally null)', async () => {
      const ctx = createMockContext(
        makeAggregatorWithSystemStatus(createMockSystemStatusForSP11()),
        {
          supervisorService: {
            getStatusSnapshot: vi.fn().mockResolvedValue(createMockSupervisorSnapshot()),
          },
          costGovernanceService: {
            getBudgetStatus: vi.fn().mockReturnValue(createMockBudgetStatus()),
          },
          maoProjectionService: {
            getSystemSnapshot: vi.fn().mockResolvedValue(createMockMaoSnapshot(2)),
          },
        },
      );
      const caller = await getCaller(ctx);
      const result = await caller.health.getStatusBarSnapshot({ projectId: 'project-1' });
      // Parses through the schema (the procedure already uses .output(...))
      expect(StatusBarSnapshotSchema.safeParse(result).success).toBe(true);
      // Three of four are non-null; cognitiveProfile is structurally null per
      // SUPV-SP11-013 (Decision #7 Option D.2).
      expect(result.backpressure).not.toBeNull();
      expect(result.budget).not.toBeNull();
      expect(result.activeAgents).not.toBeNull();
      expect(result.cognitiveProfile).toBeNull();
    });

    it('IT-SP11-SNAPSHOT-PARTIAL-BACKPRESSURE-NULL — only backpressure source throws → backpressure null; others unaffected; no throw', async () => {
      const aggregator: IHealthAggregator = {
        getSystemStatus: vi.fn().mockImplementation(() => {
          throw new Error('boom');
        }),
        getProviderHealth: vi.fn().mockReturnValue(createMockProviderHealth()),
        getAgentStatus: vi.fn().mockReturnValue(createMockAgentStatus()),
        dispose: vi.fn(),
      };
      const ctx = createMockContext(aggregator, {
        supervisorService: {
          getStatusSnapshot: vi.fn().mockResolvedValue(createMockSupervisorSnapshot()),
        },
        costGovernanceService: {
          getBudgetStatus: vi.fn().mockReturnValue(createMockBudgetStatus()),
        },
        maoProjectionService: {
          getSystemSnapshot: vi.fn().mockResolvedValue(createMockMaoSnapshot(1)),
        },
      });
      const caller = await getCaller(ctx);
      const result = await caller.health.getStatusBarSnapshot({ projectId: 'project-1' });
      expect(result.backpressure).toBeNull();
      expect(result.budget).not.toBeNull();
      expect(result.activeAgents).not.toBeNull();
    });

    it('IT-SP11-SNAPSHOT-PARTIAL-BUDGET-NULL — budget source throws → budget null; others unaffected; no throw', async () => {
      const ctx = createMockContext(
        makeAggregatorWithSystemStatus(createMockSystemStatusForSP11()),
        {
          supervisorService: {
            getStatusSnapshot: vi.fn().mockResolvedValue(createMockSupervisorSnapshot()),
          },
          costGovernanceService: {
            getBudgetStatus: vi.fn().mockImplementation(() => {
              throw new Error('budget boom');
            }),
          },
          maoProjectionService: {
            getSystemSnapshot: vi.fn().mockResolvedValue(createMockMaoSnapshot(1)),
          },
        },
      );
      const caller = await getCaller(ctx);
      const result = await caller.health.getStatusBarSnapshot({ projectId: 'project-1' });
      expect(result.budget).toBeNull();
      expect(result.backpressure).not.toBeNull();
      expect(result.activeAgents).not.toBeNull();
    });

    it('IT-SP11-SNAPSHOT-PARTIAL-AGENTS-NULL — MAO source throws → activeAgents null; others unaffected; no throw', async () => {
      const ctx = createMockContext(
        makeAggregatorWithSystemStatus(createMockSystemStatusForSP11()),
        {
          supervisorService: {
            getStatusSnapshot: vi.fn().mockResolvedValue(createMockSupervisorSnapshot()),
          },
          costGovernanceService: {
            getBudgetStatus: vi.fn().mockReturnValue(createMockBudgetStatus()),
          },
          maoProjectionService: {
            getSystemSnapshot: vi.fn().mockRejectedValue(new Error('mao boom')),
          },
        },
      );
      const caller = await getCaller(ctx);
      const result = await caller.health.getStatusBarSnapshot({ projectId: 'project-1' });
      expect(result.activeAgents).toBeNull();
      expect(result.backpressure).not.toBeNull();
      expect(result.budget).not.toBeNull();
    });

    it('IT-SP11-SNAPSHOT-ALL-NULL-THROW — backpressure + budget + agents all throw + cognitive structurally null → procedure throws', async () => {
      const aggregator: IHealthAggregator = {
        getSystemStatus: vi.fn().mockImplementation(() => {
          throw new Error('boom');
        }),
        getProviderHealth: vi.fn().mockReturnValue(createMockProviderHealth()),
        getAgentStatus: vi.fn().mockReturnValue(createMockAgentStatus()),
        dispose: vi.fn(),
      };
      const ctx = createMockContext(aggregator, {
        supervisorService: {
          getStatusSnapshot: vi.fn().mockRejectedValue(new Error('supervisor boom')),
        },
        costGovernanceService: {
          getBudgetStatus: vi.fn().mockImplementation(() => {
            throw new Error('budget boom');
          }),
        },
        maoProjectionService: {
          getSystemSnapshot: vi.fn().mockRejectedValue(new Error('mao boom')),
        },
      });
      const caller = await getCaller(ctx);
      await expect(caller.health.getStatusBarSnapshot({ projectId: 'project-1' })).rejects.toThrow();
    });
  });
});
