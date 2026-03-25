/**
 * Tests for MAO degradedReasonCode health integration (SP 1.2).
 *
 * Verifies that MaoProjectionService.degradedReasonCode includes
 * 'system_health_degraded' as a tertiary fallback when the system boot
 * status is degraded, without breaking existing voice-projection and
 * graph-unavailable sources.
 */
import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type {
  ConfirmationProof,
  IEscalationService,
  IHealthAggregator,
  IOpctlService,
  IScheduler,
  IWorkflowEngine,
  IWitnessService,
  ProjectId,
  SystemStatusSnapshot,
  WitnessAuthorizationInput,
  WitnessCompletionInput,
  WitnessEvent,
  WorkflowRunState,
} from '@nous/shared';
import { MaoProjectionService } from '../mao-projection-service.js';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as ProjectId;
const RUN_ID = '22222222-2222-2222-2222-222222222222';
const NODE_A = '33333333-3333-3333-3333-333333333333';
const NODE_B = '44444444-4444-4444-4444-444444444444';
const NOW = '2026-03-25T12:00:00.000Z';

function mockWitnessService(): IWitnessService {
  return {
    appendAuthorization: async (_input: WitnessAuthorizationInput) =>
      ({ id: randomUUID(), sequence: 1 } as WitnessEvent),
    appendCompletion: async (_input: WitnessCompletionInput) =>
      ({ id: randomUUID(), sequence: 2 } as WitnessEvent),
    appendInvariant: async () => ({} as WitnessEvent),
    createCheckpoint: async () => ({} as any),
    rotateKeyEpoch: async () => 1,
    verify: async () => ({} as any),
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
    graphDigest: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    status: 'blocked_review',
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
    blockedNodeIds: [NODE_B as any],
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
        status: 'blocked',
        attempts: [
          {
            attempt: 1,
            status: 'blocked',
            dispatchLineageId: '88888888-8888-8888-8888-888888888888' as any,
            governanceDecision: {
              outcome: 'allow_with_flag',
              reasonCode: 'CGR-ALLOW-WITH-FLAG',
              governance: 'must',
              actionCategory: 'trace-persist',
              projectControlState: 'running',
              patternId: '99999999-9999-9999-9999-999999999999' as any,
              confidence: 0.9,
              confidenceTier: 'high',
              supportingSignals: 4,
              decayState: 'stable',
              autonomyAllowed: false,
              requiresConfirmation: false,
              highRiskOverrideApplied: false,
              evidenceRefs: [],
              explanation: {
                patternId: '99999999-9999-9999-9999-999999999999' as any,
                outcomeRef: 'workflow',
                evidenceRefs: [],
              },
            } as any,
            waitState: {
              kind: 'human_decision',
              reasonCode: 'workflow_wait_paused_review',
              evidenceRefs: ['evidence://review'],
              requestedAt: NOW,
              resumeToken: 'resume-token',
            },
            sideEffectStatus: 'idempotent',
            reasonCode: 'workflow_wait_paused_review',
            evidenceRefs: ['evidence://review'],
            startedAt: NOW,
            updatedAt: NOW,
          },
        ],
        activeAttempt: 1,
        activeWaitState: {
          kind: 'human_decision',
          reasonCode: 'workflow_wait_paused_review',
          evidenceRefs: ['evidence://review'],
          requestedAt: NOW,
          resumeToken: 'resume-token',
        },
        correctionArcs: [],
        reasonCode: 'workflow_wait_paused_review',
        evidenceRefs: ['evidence://review'],
        lastDispatchLineageId: '88888888-8888-8888-8888-888888888888' as any,
        updatedAt: NOW,
      },
    },
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
      {
        id: '88888888-8888-8888-8888-888888888888' as any,
        runId: RUN_ID as any,
        nodeDefinitionId: NODE_B as any,
        parentNodeDefinitionId: NODE_A as any,
        attempt: 1,
        reasonCode: 'node_ready',
        evidenceRefs: ['evidence://dispatch'],
        occurredAt: NOW,
      },
    ],
    startedAt: NOW,
    updatedAt: NOW,
  };
}

function createGraph(runState: WorkflowRunState) {
  return {
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
          config: { type: 'model-call', modelRole: 'reasoner', promptRef: 'prompt://draft' },
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
}

function createWorkflowEngine(runState: WorkflowRunState): IWorkflowEngine {
  const graph = createGraph(runState);
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

function createOpctlService(): IOpctlService {
  return {
    submitCommand: async (envelope) => ({
      status: 'applied',
      control_command_id: envelope.control_command_id,
      target_ids_hash: 'hash',
    }),
    requestConfirmationProof: async (params) =>
      ({
        proof_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
        issued_at: NOW,
        expires_at: '2026-03-25T13:00:00.000Z',
        scope_hash: 'hash',
        action: params.action,
        tier: params.tier,
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

function createMockHealthAggregator(bootStatus: 'booting' | 'ready' | 'degraded' = 'ready'): IHealthAggregator {
  return {
    getSystemStatus: vi.fn().mockReturnValue({
      bootStatus,
      completedBootSteps: [],
      issueCodes: [],
      inboxReady: bootStatus === 'ready',
      pendingSystemRuns: 0,
      backlogAnalytics: {
        queuedCount: 0,
        activeCount: 0,
        suspendedCount: 0,
        completedInWindow: 0,
        failedInWindow: 0,
        pressureTrend: 'idle',
      },
      collectedAt: NOW,
    }),
    getProviderHealth: vi.fn().mockReturnValue({ providers: [], collectedAt: NOW }),
    getAgentStatus: vi.fn().mockReturnValue({ gateways: [], appSessions: [], collectedAt: NOW }),
    dispose: vi.fn(),
  };
}

function createVoiceControlService(degradedReason?: string) {
  return {
    getSessionProjection: async () => ({
      session_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      project_id: PROJECT_ID,
      principal_id: 'principal',
      current_turn_state: 'listening',
      assistant_output_state: 'idle',
      degraded_mode: {
        session_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        project_id: PROJECT_ID,
        active: !!degradedReason,
        reason: degradedReason,
        evidence_refs: [],
      },
      pending_confirmation: {
        required: false,
        dual_channel_required: false,
        text_surface_targets: [],
      },
      continuation_required: false,
      evidence_refs: [],
      updated_at: NOW,
    }),
  } as any;
}

function createService(opts?: {
  healthAggregator?: IHealthAggregator;
  voiceDegradedReason?: string;
}) {
  const runState = createWorkflowRun();
  return new MaoProjectionService({
    opctlService: createOpctlService(),
    workflowEngine: createWorkflowEngine(runState),
    escalationService: createEscalationService(),
    schedulerService: createSchedulerService(),
    voiceControlService: createVoiceControlService(opts?.voiceDegradedReason),
    witnessService: mockWitnessService(),
    healthAggregator: opts?.healthAggregator,
  });
}

describe('MaoProjectionService — degradedReasonCode health integration', () => {
  it('returns system_health_degraded when boot status is degraded and no higher-priority sources', async () => {
    const aggregator = createMockHealthAggregator('degraded');
    const service = createService({ healthAggregator: aggregator });

    const snapshot = await service.getProjectSnapshot({
      projectId: PROJECT_ID,
      densityMode: 'D2',
    });

    expect(snapshot.diagnostics.degradedReasonCode).toBe('system_health_degraded');
    expect(aggregator.getSystemStatus).toHaveBeenCalled();
  });

  it('returns voice degradation reason when voice takes precedence over health', async () => {
    const aggregator = createMockHealthAggregator('degraded');
    const service = createService({
      healthAggregator: aggregator,
      voiceDegradedReason: 'transport_degraded',
    });

    const snapshot = await service.getProjectSnapshot({
      projectId: PROJECT_ID,
      densityMode: 'D2',
    });

    expect(snapshot.diagnostics.degradedReasonCode).toBe('transport_degraded');
  });

  it('returns undefined when boot status is ready and no other degradation', async () => {
    const aggregator = createMockHealthAggregator('ready');
    const service = createService({ healthAggregator: aggregator });

    const snapshot = await service.getProjectSnapshot({
      projectId: PROJECT_ID,
      densityMode: 'D2',
    });

    expect(snapshot.diagnostics.degradedReasonCode).toBeUndefined();
  });

  it('preserves existing behavior when healthAggregator is not provided', async () => {
    const service = createService(); // no healthAggregator

    const snapshot = await service.getProjectSnapshot({
      projectId: PROJECT_ID,
      densityMode: 'D2',
    });

    // No voice degradation, no graph-unavailable — should be undefined
    expect(snapshot.diagnostics.degradedReasonCode).toBeUndefined();
  });

  it('returns undefined when boot status is booting (not degraded)', async () => {
    const aggregator = createMockHealthAggregator('booting');
    const service = createService({ healthAggregator: aggregator });

    const snapshot = await service.getProjectSnapshot({
      projectId: PROJECT_ID,
      densityMode: 'D2',
    });

    expect(snapshot.diagnostics.degradedReasonCode).toBeUndefined();
  });

  it('uses setHealthAggregator for late binding', async () => {
    const service = createService(); // no aggregator initially
    const aggregator = createMockHealthAggregator('degraded');

    // Late-bind the aggregator
    service.setHealthAggregator(aggregator);

    const snapshot = await service.getProjectSnapshot({
      projectId: PROJECT_ID,
      densityMode: 'D2',
    });

    expect(snapshot.diagnostics.degradedReasonCode).toBe('system_health_degraded');
    expect(aggregator.getSystemStatus).toHaveBeenCalled();
  });
});
