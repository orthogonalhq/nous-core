/**
 * WR-162 SP 3 IT-2 — DNR-B3 read-site invariance under a stubbed
 * SupervisorService that returns populated supervisor fields.
 *
 * Invariant (DNR-B3): in SP 3 the MAO projection STILL emits `undefined`
 * for all three supervisor fields (`guardrail_status`,
 * `witness_integrity_status`, `sentinel_risk_score`) even when the wired
 * supervisor service returns populated values. SP 6 flips the read.
 */
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type {
  AgentGatewayEntry,
  ConfirmationProof,
  IEscalationService,
  IHealthAggregator,
  IOpctlService,
  IProjectStore,
  IScheduler,
  ISupervisorHandle,
  ISupervisorService,
  IWorkflowEngine,
  ProjectId,
  SentinelRiskScore,
  SupervisorConfig,
  SupervisorStatusSnapshot,
  SupervisorViolationRecord,
  WitnessAuthorizationInput,
  WitnessCompletionInput,
  WitnessEvent,
  WorkflowRunState,
} from '@nous/shared';
import { MaoProjectionService } from '../mao-projection-service.js';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as ProjectId;
const RUN_ID = '22222222-2222-2222-2222-222222222222' as const;
const NODE_A = '33333333-3333-3333-3333-333333333333' as const;
const NODE_B = '44444444-4444-4444-4444-444444444444' as const;
const NOW = '2026-03-10T01:00:00.000Z';

function mockWitnessService(): import('@nous/shared').IWitnessService {
  return {
    appendAuthorization: async (_input: WitnessAuthorizationInput) =>
      ({
        id: randomUUID() as import('@nous/shared').WitnessEventId,
        sequence: 1,
      }) as WitnessEvent,
    appendCompletion: async (_input: WitnessCompletionInput) =>
      ({
        id: randomUUID() as import('@nous/shared').WitnessEventId,
        sequence: 2,
      }) as WitnessEvent,
    appendInvariant: async () => ({}) as WitnessEvent,
    createCheckpoint: async () =>
      ({}) as import('@nous/shared').WitnessCheckpoint,
    rotateKeyEpoch: async () => 1,
    verify: async () =>
      ({}) as import('@nous/shared').VerificationReport,
    getReport: async () => null,
    listReports: async () => [],
    getLatestCheckpoint: async () => null,
  };
}

function createWorkflowRun(): WorkflowRunState {
  return {
    runId: RUN_ID as any,
    workflowDefinitionId: '55555555-5555-5555-5555-555555555555' as any,
    projectId: PROJECT_ID,
    workflowVersion: '1.0.0',
    graphDigest:
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    status: 'running',
    admission: {
      allowed: true,
      reasonCode: 'workflow_admitted',
      evidenceRefs: ['workflow:admission'],
    },
    evidenceRefs: ['workflow:state'],
    activeNodeIds: [NODE_B as any],
    activatedEdgeIds: [],
    readyNodeIds: [],
    waitingNodeIds: [NODE_B as any],
    blockedNodeIds: [],
    completedNodeIds: [NODE_A as any],
    checkpointState: 'idle',
    nodeStates: {
      [NODE_A]: {
        id: '66666666-6666-6666-6666-666666666666' as any,
        nodeDefinitionId: NODE_A as any,
        status: 'completed',
        attempts: [],
        activeAttempt: null,
        correctionArcs: [],
        reasonCode: 'workflow_step_completed',
        evidenceRefs: ['evidence://node-a'],
        updatedAt: NOW,
      },
      [NODE_B]: {
        id: '77777777-7777-7777-7777-777777777777' as any,
        nodeDefinitionId: NODE_B as any,
        status: 'waiting',
        attempts: [],
        activeAttempt: null,
        correctionArcs: [],
        reasonCode: 'workflow_step_waiting',
        evidenceRefs: ['evidence://node-b'],
        updatedAt: NOW,
      },
    } as any,
    dispatchLineage: [
      {
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' as any,
        runId: RUN_ID as any,
        nodeDefinitionId: NODE_A as any,
        attempt: 0,
        reasonCode: 'workflow_started',
        evidenceRefs: ['evidence://start'],
        occurredAt: NOW,
      },
    ],
    startedAt: NOW,
    updatedAt: NOW,
  };
}

function createWorkflowEngine(runState: WorkflowRunState): IWorkflowEngine {
  const graph = {
    workflowDefinitionId: runState.workflowDefinitionId,
    projectId: PROJECT_ID,
    version: '1.0.0',
    graphDigest: runState.graphDigest,
    entryNodeIds: [NODE_A],
    topologicalOrder: [NODE_A, NODE_B],
    nodes: {
      [NODE_A]: {
        definition: {
          id: NODE_A,
          name: 'Draft',
          type: 'model-call',
          governance: 'must',
          executionModel: 'synchronous',
          config: {
            type: 'model-call',
            modelRole: 'cortex-chat',
            promptRef: 'prompt://draft',
          },
        },
        inboundEdgeIds: [],
        outboundEdgeIds: ['edge-1'],
        topologicalIndex: 0,
      },
      [NODE_B]: {
        definition: {
          id: NODE_B,
          name: 'Review',
          type: 'human-decision',
          governance: 'must',
          executionModel: 'synchronous',
          config: { type: 'human-decision', decisionRef: 'decision://review' },
        },
        inboundEdgeIds: ['edge-1'],
        outboundEdgeIds: [],
        topologicalIndex: 1,
      },
    },
    edges: {
      'edge-1': { id: 'edge-1', from: NODE_A, to: NODE_B, priority: 0 },
    },
  } as any;

  return {
    resolveDefinition: async () => ({}) as any,
    resolveDefinitionSource: async () => ({}) as any,
    deriveGraph: async () => graph,
    evaluateAdmission: async () => ({}) as any,
    start: async () => ({}) as any,
    resume: async () => runState,
    pause: async () => runState,
    cancel: async () => runState,
    completeNode: async () => runState,
    executeReadyNode: async () => runState,
    continueNode: async () => runState,
    getState: async () => runState,
    listProjectRuns: async () => [runState],
    getRunGraph: async () => graph,
  };
}

function createEscalationService(): IEscalationService {
  return {
    notify: async () => 'escalation-1' as any,
    checkResponse: async () => null,
    get: async () => null,
    listProjectQueue: async () => [] as any,
    acknowledge: async () => null,
  };
}

function createSchedulerService(): IScheduler {
  return {
    register: async () => 'schedule-1',
    upsert: async () => ({}) as any,
    get: async () => null,
    cancel: async () => true,
    list: async () => [] as any,
  };
}

function createOpctlServiceMock(): IOpctlService {
  return {
    submitCommand: async (envelope) => ({
      status: 'applied',
      control_command_id: envelope.control_command_id,
      target_ids_hash: 'hash',
    }),
    requestConfirmationProof: async () =>
      ({
        proof_id: randomUUID(),
        issued_at: NOW,
        expires_at: '2026-03-10T02:00:00.000Z',
        scope_hash: 'hash',
        action: 'hard_stop',
        tier: 'T3',
        signature: 'sig',
      }) satisfies ConfirmationProof,
    validateConfirmationProof: async () => true,
    resolveScope: async () => ({
      scope: {
        class: 'project_run_scope',
        kind: 'project_run',
        target_ids: [],
        project_id: PROJECT_ID,
      },
      target_ids: [],
      target_ids_hash: 'hash',
      target_count: 0,
      resolved_at: NOW,
    }),
    hasStartLock: async () => false,
    setStartLock: async () => {},
    getProjectControlState: async () => 'running',
  };
}

function mockHealthAggregator(): IHealthAggregator {
  const gateways: AgentGatewayEntry[] = [];
  return {
    getProviderHealth: () =>
      ({ providers: [], collectedAt: NOW }) as any,
    getAgentStatus: () =>
      ({ gateways, appSessions: [], collectedAt: NOW }) as any,
    getSystemStatus: () =>
      ({
        bootStatus: 'ready',
        completedBootSteps: [],
        issueCodes: [],
        inboxReady: true,
        pendingSystemRuns: 0,
        backlogAnalytics: {
          queuedCount: 0,
          activeCount: 0,
          suspendedCount: 0,
          completedInWindow: 0,
          failedInWindow: 0,
          pressureTrend: 'stable' as const,
        },
        collectedAt: NOW,
      }) as any,
    dispose: () => {},
  };
}

function createProjectStore(): IProjectStore {
  return {
    create: async () => PROJECT_ID,
    get: async () => ({
      id: PROJECT_ID,
      name: 'Test',
      description: 'Test',
      rootDir: '/',
      createdAt: NOW,
      updatedAt: NOW,
    }) as any,
    list: async () => [],
    update: async () => {},
    archive: async () => {},
  } as IProjectStore;
}

/**
 * Stub supervisor service — returns POPULATED fields for
 * `getAgentSupervisorSnapshot`. If `buildAgentProjection` were reading
 * these (it must NOT in SP 3), the projection output would carry them.
 */
class PopulatedStubSupervisorService implements ISupervisorService {
  readonly agentSnapshotCalls: string[] = [];

  startSupervision(_config: SupervisorConfig): ISupervisorHandle {
    return {
      stop: async () => {},
      isActive: () => true,
    };
  }

  async stopSupervision(): Promise<void> {}

  async getRecentViolations(): Promise<SupervisorViolationRecord[]> {
    return [];
  }

  async getStatusSnapshot(): Promise<SupervisorStatusSnapshot> {
    return {
      active: true,
      agentsMonitored: 1,
      activeViolationCounts: { s0: 0, s1: 0, s2: 0, s3: 0 },
      lifetime: {
        violationsDetected: 0,
        anomaliesClassified: 0,
        enforcementsApplied: 0,
      },
      witnessIntegrity: 'intact',
      riskSummary: {},
      reportedAt: NOW,
    };
  }

  async getSentinelRiskScores(): Promise<SentinelRiskScore[]> {
    return [];
  }

  async getAgentSupervisorSnapshot(agentId: string) {
    this.agentSnapshotCalls.push(agentId);
    // POPULATED — proves DNR-B3 by showing that the projection still
    // emits `undefined` even when the supervisor has real values.
    return {
      guardrail_status: 'warning' as const,
      witness_integrity_status: 'degraded' as const,
      sentinel_risk_score: 42,
    };
  }
}

describe('MaoProjectionService — IT-2 DNR-B3 read-site invariance (WR-162 SP 3)', () => {
  it('buildAgentProjection returns undefined for all three supervisor fields even when supervisorService returns populated values', async () => {
    const supervisor = new PopulatedStubSupervisorService();
    const service = new MaoProjectionService({
      opctlService: createOpctlServiceMock(),
      workflowEngine: createWorkflowEngine(createWorkflowRun()),
      escalationService: createEscalationService(),
      schedulerService: createSchedulerService(),
      witnessService: mockWitnessService(),
      healthAggregator: mockHealthAggregator(),
      projectStore: createProjectStore(),
      supervisorService: supervisor,
    });

    const projections = await service.getAgentProjections(PROJECT_ID);
    expect(projections.length).toBeGreaterThan(0);

    for (const projection of projections) {
      // DNR-B3 invariant: SP 3 does NOT read supervisorService here.
      // SP 6 flips the read.
      expect(
        (projection as unknown as Record<string, unknown>).guardrail_status,
      ).toBeUndefined();
      expect(
        (projection as unknown as Record<string, unknown>)
          .witness_integrity_status,
      ).toBeUndefined();
      expect(
        (projection as unknown as Record<string, unknown>).sentinel_risk_score,
      ).toBeUndefined();
    }

    // The service's per-agent snapshot method was NOT invoked — proves the
    // read-site really is dormant in SP 3 (not just that it returned null).
    expect(supervisor.agentSnapshotCalls).toHaveLength(0);
  });

  it('constructs compile-cleanly with the new supervisorService dep (additive trailing optional)', () => {
    const service = new MaoProjectionService({
      opctlService: createOpctlServiceMock(),
      workflowEngine: createWorkflowEngine(createWorkflowRun()),
      escalationService: createEscalationService(),
      schedulerService: createSchedulerService(),
      supervisorService: new PopulatedStubSupervisorService(),
    });
    expect(service).toBeInstanceOf(MaoProjectionService);
  });
});
