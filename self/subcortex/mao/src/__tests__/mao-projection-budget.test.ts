import { describe, expect, it } from 'vitest';
import type {
  ConfirmationProof,
  IEscalationService,
  IOpctlService,
  IScheduler,
  IWorkflowEngine,
  ProjectId,
  WitnessAuthorizationInput,
  WitnessCompletionInput,
  WitnessEvent,
  WorkflowRunState,
} from '@nous/shared';
import { randomUUID } from 'node:crypto';
import { MaoProjectionService } from '../mao-projection-service.js';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as ProjectId;
const RUN_ID = '22222222-2222-2222-2222-222222222222' as const;
const NODE_A = '33333333-3333-3333-3333-333333333333' as const;
const NOW = '2026-04-01T01:00:00.000Z';

function mockWitnessService(): import('@nous/shared').IWitnessService {
  return {
    appendAuthorization: async (_input: WitnessAuthorizationInput) =>
      ({ id: randomUUID() as import('@nous/shared').WitnessEventId, sequence: 1 } as WitnessEvent),
    appendCompletion: async (_input: WitnessCompletionInput) =>
      ({ id: randomUUID() as import('@nous/shared').WitnessEventId, sequence: 2 } as WitnessEvent),
    appendInvariant: async () => ({} as WitnessEvent),
    createCheckpoint: async () => ({} as import('@nous/shared').WitnessCheckpoint),
    rotateKeyEpoch: async () => 1,
    verify: async () => ({} as import('@nous/shared').VerificationReport),
    getReport: async () => null,
    listReports: async () => [],
    getLatestCheckpoint: async () => null,
  };
}

function createMinimalWorkflowRun(): WorkflowRunState {
  return {
    runId: RUN_ID as any,
    workflowDefinitionId: '55555555-5555-5555-5555-555555555555' as any,
    projectId: PROJECT_ID,
    workflowVersion: '1.0.0',
    graphDigest: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    status: 'running',
    admission: {
      allowed: true,
      reasonCode: 'workflow_admitted',
      evidenceRefs: ['workflow:admission'],
    },
    evidenceRefs: ['workflow:state'],
    activeNodeIds: [NODE_A as any],
    activatedEdgeIds: [],
    readyNodeIds: [],
    waitingNodeIds: [],
    blockedNodeIds: [],
    completedNodeIds: [],
    checkpointState: 'idle',
    nodeStates: {
      [NODE_A]: {
        id: '66666666-6666-6666-6666-666666666666' as any,
        nodeDefinitionId: NODE_A as any,
        status: 'running',
        attempts: [
          {
            attempt: 1,
            status: 'running',
            dispatchLineageId: '88888888-8888-8888-8888-888888888888' as any,
            governanceDecision: {
              outcome: 'allow',
              reasonCode: 'CGR-ALLOW',
              governance: 'must',
              actionCategory: 'trace-persist',
              projectControlState: 'running',
              patternId: '99999999-9999-9999-9999-999999999999' as any,
              confidence: 0.95,
              confidenceTier: 'high',
              supportingSignals: 3,
              decayState: 'stable',
              autonomyAllowed: true,
              requiresConfirmation: false,
              highRiskOverrideApplied: false,
              evidenceRefs: [],
              explanation: {
                patternId: '99999999-9999-9999-9999-999999999999' as any,
                outcomeRef: 'workflow',
                evidenceRefs: [],
              },
            } as any,
            sideEffectStatus: 'idempotent',
            reasonCode: 'node_ready',
            evidenceRefs: ['evidence://running'],
            startedAt: NOW,
            updatedAt: NOW,
          },
        ],
        activeAttempt: 1,
        correctionArcs: [],
        reasonCode: 'node_ready',
        evidenceRefs: ['evidence://running'],
        lastDispatchLineageId: '88888888-8888-8888-8888-888888888888' as any,
        updatedAt: NOW,
      },
    },
    dispatchLineage: [
      {
        id: '88888888-8888-8888-8888-888888888888' as any,
        runId: RUN_ID as any,
        nodeDefinitionId: NODE_A as any,
        attempt: 1,
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
    topologicalOrder: [NODE_A],
    nodes: {
      [NODE_A]: {
        definition: {
          id: NODE_A,
          name: 'Work',
          type: 'model-call',
          governance: 'must',
          executionModel: 'synchronous',
          config: {
            type: 'model-call',
            modelRole: 'cortex-chat',
            promptRef: 'prompt://work',
          },
        },
        inboundEdgeIds: [],
        outboundEdgeIds: [],
        topologicalIndex: 0,
      },
    },
    edges: {},
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

function createOpctlService(): IOpctlService {
  return {
    submitCommand: async () => ({
      status: 'applied',
      control_command_id: 'cmd-1',
      target_ids_hash: 'hash',
    }) as any,
    getProjectControlState: async () => 'running',
    hasStartLock: async () => false,
    setStartLock: async () => {},
    getCommandAudit: async () => [],
    getRequiredConfirmationTier: () => 'T1' as any,
    getPreflightImpact: async () => ({
      activeRunCount: 0,
      activeAgentCount: 0,
      blockedAgentCount: 0,
      urgentAgentCount: 0,
      affectedScheduleCount: 0,
      evidenceRefs: [],
    }),
    requestConfirmationProof: async (params) => ({
      proof_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      issued_at: NOW,
      expires_at: '2026-04-01T02:00:00.000Z',
      scope_hash: 'hash',
      action: params.action,
      tier: params.tier,
      signature: 'sig',
    } satisfies ConfirmationProof),
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
  } as IOpctlService;
}

function createEscalationService(): IEscalationService {
  return {
    notify: async () => 'escalation-1' as any,
    checkResponse: async () => null,
    get: async () => null,
    listProjectQueue: async () => [],
    acknowledge: async () => null,
  };
}

function createSchedulerService(): IScheduler {
  return {
    register: async () => 'schedule-1',
    upsert: async () => ({} as any),
    get: async () => null,
    cancel: async () => true,
    list: async () => [],
  };
}

type MaoProjectionServiceDeps = ConstructorParameters<typeof MaoProjectionService>[0];

function createService(
  getBudgetStatus?: MaoProjectionServiceDeps['getBudgetStatus'],
) {
  const runState = createMinimalWorkflowRun();
  return new MaoProjectionService({
    opctlService: createOpctlService(),
    workflowEngine: createWorkflowEngine(runState),
    escalationService: createEscalationService(),
    schedulerService: createSchedulerService(),
    witnessService: mockWitnessService(),
    projectStore: {
      get: async () => ({} as any),
      list: async () => [],
      create: async () => ({} as any),
      update: async () => ({} as any),
    } as any,
    getBudgetStatus,
  });
}

describe('MaoProjectionService — budgetUtilization enrichment', () => {
  it('includes budgetUtilization when getBudgetStatus returns data', async () => {
    const svc = createService(() => ({
      utilizationPercent: 73.5,
      currentSpendUsd: 14.70,
      budgetCeilingUsd: 20.00,
      softAlertFired: true,
      hardCeilingFired: false,
    }));

    const snapshot = await svc.getProjectSnapshot({
      projectId: PROJECT_ID,
      densityMode: 'D2',
    });

    expect(snapshot.budgetUtilization).toBeDefined();
    expect(snapshot.budgetUtilization!.utilizationPercent).toBe(73.5);
    expect(snapshot.budgetUtilization!.softAlertFired).toBe(true);
    expect(snapshot.budgetUtilization!.hardCeilingFired).toBe(false);
  });

  it('omits budgetUtilization when getBudgetStatus returns null', async () => {
    const svc = createService(() => null);

    const snapshot = await svc.getProjectSnapshot({
      projectId: PROJECT_ID,
      densityMode: 'D2',
    });

    expect(snapshot.budgetUtilization).toBeUndefined();
  });

  it('omits budgetUtilization when getBudgetStatus is not provided', async () => {
    const svc = createService(undefined);

    const snapshot = await svc.getProjectSnapshot({
      projectId: PROJECT_ID,
      densityMode: 'D2',
    });

    expect(snapshot.budgetUtilization).toBeUndefined();
  });

  it('omits budgetUtilization when getBudgetStatus throws (graceful degradation)', async () => {
    const svc = createService(() => {
      throw new Error('Cost service unavailable');
    });

    const snapshot = await svc.getProjectSnapshot({
      projectId: PROJECT_ID,
      densityMode: 'D2',
    });

    expect(snapshot.budgetUtilization).toBeUndefined();
  });
});
