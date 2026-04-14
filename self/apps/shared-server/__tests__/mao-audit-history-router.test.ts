import { describe, expect, it, vi } from 'vitest';
import type { MaoControlAuditHistoryEntry } from '@nous/shared';

/**
 * Mock all workspace packages to isolate the mao router.
 * Follows the established pattern from health-router.test.ts.
 */
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

const TEST_PROJECT_ID = '00000000-0000-0000-0000-000000000001';
const NOW = '2026-03-25T12:00:00.000Z';

function createMockAuditEntry(
  overrides: Partial<MaoControlAuditHistoryEntry> = {},
): MaoControlAuditHistoryEntry {
  return {
    commandId: '10000000-0000-0000-0000-000000000001',
    action: 'pause_project',
    actorId: 'operator-1',
    reason: 'Manual pause for investigation',
    reasonCode: 'operator_manual_pause',
    at: NOW,
    evidenceRefs: [],
    resumeReadinessStatus: 'not_applicable',
    decisionRef: 'decision-ref-001',
    ...overrides,
  };
}

function createMockContext(
  getControlAuditHistory: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue([]),
) {
  return {
    maoProjectionService: {
      getControlAuditHistory,
      getAgentProjections: vi.fn(),
      getProjectControlProjection: vi.fn(),
      getProjectSnapshot: vi.fn(),
      getAgentInspectProjection: vi.fn(),
      getRunGraphSnapshot: vi.fn(),
      requestProjectControl: vi.fn(),
    },
    // Minimal stubs for other NousContext fields — not used by mao procedures
    healthAggregator: {},
    healthMonitor: { check: vi.fn(), getMetrics: vi.fn() },
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
  } as any;
}

describe('mao tRPC router — getControlAuditHistory', () => {
  async function getCaller(ctx: any) {
    const { maoRouter } = await import('../src/trpc/routers/mao.js');
    const { router: createRouter } = await import('../src/trpc/trpc.js');
    const testRouter = createRouter({ mao: maoRouter });
    return testRouter.createCaller(ctx);
  }

  it('returns typed MaoControlAuditHistoryEntry[] shape', async () => {
    const entry = createMockAuditEntry();
    const mockFn = vi.fn().mockResolvedValue([entry]);
    const ctx = createMockContext(mockFn);
    const caller = await getCaller(ctx);

    const result = await caller.mao.getControlAuditHistory({
      projectId: TEST_PROJECT_ID,
    });

    expect(result).toEqual([entry]);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty('commandId');
    expect(result[0]).toHaveProperty('action');
    expect(result[0]).toHaveProperty('actorId');
    expect(result[0]).toHaveProperty('reason');
    expect(result[0]).toHaveProperty('reasonCode');
    expect(result[0]).toHaveProperty('at');
    expect(result[0]).toHaveProperty('evidenceRefs');
    expect(result[0]).toHaveProperty('resumeReadinessStatus');
    expect(result[0]).toHaveProperty('decisionRef');
  });

  it('returns empty array for unknown project', async () => {
    const mockFn = vi.fn().mockResolvedValue([]);
    const ctx = createMockContext(mockFn);
    const caller = await getCaller(ctx);

    const result = await caller.mao.getControlAuditHistory({
      projectId: '99999999-9999-9999-9999-999999999999',
    });

    expect(result).toEqual([]);
    expect(result).toHaveLength(0);
  });

  it('multiple entries maintain chronological order', async () => {
    const entries = [
      createMockAuditEntry({
        commandId: '10000000-0000-0000-0000-000000000001',
        at: '2026-03-25T10:00:00.000Z',
        action: 'pause_project',
      }),
      createMockAuditEntry({
        commandId: '10000000-0000-0000-0000-000000000002',
        at: '2026-03-25T11:00:00.000Z',
        action: 'resume_project',
      }),
      createMockAuditEntry({
        commandId: '10000000-0000-0000-0000-000000000003',
        at: '2026-03-25T12:00:00.000Z',
        action: 'hard_stop_project',
      }),
    ];
    const mockFn = vi.fn().mockResolvedValue(entries);
    const ctx = createMockContext(mockFn);
    const caller = await getCaller(ctx);

    const result = await caller.mao.getControlAuditHistory({
      projectId: TEST_PROJECT_ID,
    });

    expect(result).toHaveLength(3);
    expect(result[0].at).toBe('2026-03-25T10:00:00.000Z');
    expect(result[1].at).toBe('2026-03-25T11:00:00.000Z');
    expect(result[2].at).toBe('2026-03-25T12:00:00.000Z');
    expect(result[0].action).toBe('pause_project');
    expect(result[1].action).toBe('resume_project');
    expect(result[2].action).toBe('hard_stop_project');
  });

  it('passes correct projectId to service method', async () => {
    const mockFn = vi.fn().mockResolvedValue([]);
    const ctx = createMockContext(mockFn);
    const caller = await getCaller(ctx);

    await caller.mao.getControlAuditHistory({
      projectId: TEST_PROJECT_ID,
    });

    expect(mockFn).toHaveBeenCalledOnce();
    expect(mockFn).toHaveBeenCalledWith(TEST_PROJECT_ID);
  });

  it('rejects non-UUID projectId with validation error', async () => {
    const mockFn = vi.fn().mockResolvedValue([]);
    const ctx = createMockContext(mockFn);
    const caller = await getCaller(ctx);

    await expect(
      caller.mao.getControlAuditHistory({ projectId: 'not-a-uuid' }),
    ).rejects.toThrow();

    expect(mockFn).not.toHaveBeenCalled();
  });
});
