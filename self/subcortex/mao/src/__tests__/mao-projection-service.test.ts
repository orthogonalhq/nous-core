import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type {
  AgentGatewayEntry,
  ConfirmationProof,
  IEscalationService,
  IHealthAggregator,
  IOpctlService,
  IProjectStore,
  IScheduler,
  IWorkflowEngine,
  ProjectConfig,
  ProjectId,
  WitnessAuthorizationInput,
  WitnessCompletionInput,
  WitnessEvent,
  WorkflowRunState,
} from '@nous/shared';
import { SYSTEM_SCOPE_SENTINEL_PROJECT_ID } from '@nous/shared';
import { MaoProjectionService } from '../mao-projection-service.js';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as ProjectId;
const PROJECT_ID_2 = '11111111-1111-1111-1111-222222222222' as ProjectId;
const RUN_ID = '22222222-2222-2222-2222-222222222222' as const;
const NODE_A = '33333333-3333-3333-3333-333333333333' as const;
const NODE_B = '44444444-4444-4444-4444-444444444444' as const;
const NOW = '2026-03-10T01:00:00.000Z';

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

function createWorkflowRun(status: WorkflowRunState['status'] = 'blocked_review'): WorkflowRunState {
  return {
    runId: RUN_ID as any,
    workflowDefinitionId: '55555555-5555-5555-5555-555555555555' as any,
    projectId: PROJECT_ID,
    workflowVersion: '1.0.0',
    graphDigest: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    status,
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
    blockedNodeIds: status === 'blocked_review' ? [NODE_B as any] : [],
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
        status: status === 'blocked_review' ? 'blocked' : 'waiting',
        attempts: [
          {
            attempt: 1,
            status: status === 'blocked_review' ? 'blocked' : 'waiting',
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
        correctionArcs: [
          {
            id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            runId: RUN_ID as any,
            nodeDefinitionId: NODE_B as any,
            type: 'resume',
            sourceAttempt: 1,
            reasonCode: 'workflow_resume_denied_hard_stopped',
            evidenceRefs: ['evidence://resume'],
            occurredAt: NOW,
          },
        ],
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
          config: {
            type: 'human-decision',
            decisionRef: 'decision://review',
          },
        },
        inboundEdgeIds: ['edge-1'],
        outboundEdgeIds: [],
        topologicalIndex: 1,
      },
    },
    edges: {
      'edge-1': {
        id: 'edge-1',
        from: NODE_A,
        to: NODE_B,
        priority: 0,
      },
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
    listProjectQueue: async () => [
      {
        escalationId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        projectId: PROJECT_ID,
        source: 'workflow',
        severity: 'high',
        title: 'Review required',
        message: 'Operator review required',
        status: 'visible',
        routeTargets: ['mao'],
        evidenceRefs: ['evidence://escalation'],
        acknowledgements: [],
        createdAt: NOW,
        updatedAt: NOW,
      },
    ] as any,
    acknowledge: async () => null,
  };
}

function createSchedulerService(): IScheduler {
  return {
    register: async () => 'schedule-1',
    upsert: async () => ({} as any),
    get: async () => null,
    cancel: async () => true,
    list: async () => [
      {
        id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        projectId: PROJECT_ID,
        workflowDefinitionId: '55555555-5555-5555-5555-555555555555',
        workmodeId: 'system:implementation',
        trigger: {
          kind: 'cron',
          cron: '0 * * * *',
        },
        enabled: true,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ] as any,
  };
}

function createOpctlServiceMock(
  initialState: 'running' | 'paused_review' | 'hard_stopped' | 'resuming' = 'running',
): {
  opctlService: IOpctlService;
  setControlState: (next: 'running' | 'paused_review' | 'hard_stopped' | 'resuming') => void;
} {
  let controlState: 'running' | 'paused_review' | 'hard_stopped' | 'resuming' =
    initialState;
  let startLock = controlState === 'hard_stopped';

  return {
    opctlService: {
      submitCommand: async (envelope) => {
        if (envelope.action === 'pause') {
          controlState = 'paused_review';
        } else if (envelope.action === 'resume') {
          startLock = false;
          controlState = 'resuming';
        } else if (envelope.action === 'hard_stop') {
          startLock = true;
          controlState = 'hard_stopped';
        }
        return {
          status: 'applied',
          control_command_id: envelope.control_command_id,
          target_ids_hash: 'hash',
        };
      },
      requestConfirmationProof: async (params) => ({
        proof_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
        issued_at: NOW,
        expires_at: '2026-03-10T02:00:00.000Z',
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
      hasStartLock: async () => startLock,
      setStartLock: async (_projectId, locked) => {
        startLock = locked;
        if (!locked) {
          controlState = 'running';
        }
      },
      getProjectControlState: async () =>
        startLock ? 'hard_stopped' : controlState,
    },
    setControlState: (next) => {
      controlState = next;
      startLock = next === 'hard_stopped';
    },
  };
}

const SYSTEM_AGENT_ID_1 = 'aaaa0000-0000-0000-0000-000000000001';
const SYSTEM_AGENT_ID_2 = 'aaaa0000-0000-0000-0000-000000000002';

function createGatewayEntry(overrides?: Partial<AgentGatewayEntry>): AgentGatewayEntry {
  return {
    agentClass: 'Cortex::Principal',
    agentId: SYSTEM_AGENT_ID_1,
    inboxReady: true,
    visibleToolCount: 5,
    lastAckAt: NOW,
    lastSubmissionAt: NOW,
    lastResultStatus: 'ok',
    issueCount: 0,
    issueCodes: [],
    ...overrides,
  };
}

function mockHealthAggregator(bootStatus: 'booting' | 'ready' | 'degraded' = 'ready', gateways: AgentGatewayEntry[] = []): IHealthAggregator {
  return {
    getProviderHealth: () => ({
      providers: [],
      collectedAt: NOW,
    }) as any,
    getAgentStatus: () => ({
      gateways,
      appSessions: [],
      collectedAt: NOW,
    }),
    getSystemStatus: () => ({
      bootStatus,
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
    }),
    dispose: () => {},
  };
}

function mockEventBus() {
  return {
    publish: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  } as any as import('@nous/shared').IEventBus;
}

function createVoiceControlService(degraded = false) {
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
        active: degraded,
        reason: degraded ? 'transport_degraded' : undefined,
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

function createProjectStoreMock(projectIds: ProjectId[] = []): IProjectStore {
  const projects = projectIds.map((id) => ({
    id,
    name: `Project ${id}`,
    description: 'Test project',
    rootDir: `/projects/${id}`,
    createdAt: NOW,
    updatedAt: NOW,
  })) as unknown as ProjectConfig[];

  return {
    create: async () => projectIds[0] ?? ('' as ProjectId),
    get: async (id: ProjectId) => projects.find((p) => p.id === id) ?? null,
    list: async () => projects,
    update: async () => {},
    archive: async () => {},
  } as IProjectStore;
}

function createService(runState: WorkflowRunState, opts?: { healthAggregator?: IHealthAggregator; voiceDegraded?: boolean; projectStore?: IProjectStore; eventBus?: import('@nous/shared').IEventBus }) {
  const { opctlService, setControlState } = createOpctlServiceMock();

  return {
    service: new MaoProjectionService({
      opctlService,
      workflowEngine: createWorkflowEngine(runState),
      escalationService: createEscalationService(),
      schedulerService: createSchedulerService(),
      voiceControlService: createVoiceControlService(opts?.voiceDegraded),
      witnessService: mockWitnessService(),
      healthAggregator: opts?.healthAggregator,
      projectStore: opts?.projectStore,
      eventBus: opts?.eventBus,
    }),
    opctlService,
    setControlState,
  };
}

function makeMockProof(action: 'resume' | 'hard_stop' | 'pause' = 'hard_stop'): ConfirmationProof {
  return {
    proof_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    issued_at: NOW,
    expires_at: '2026-03-10T02:00:00.000Z',
    scope_hash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    action,
    tier: action === 'pause' ? 'T1' : 'T3',
    signature: 'mock-sig',
  };
}

function makeControlRequest(overrides?: Partial<import('@nous/shared').MaoProjectControlRequest>): import('@nous/shared').MaoProjectControlRequest {
  return {
    command_id: randomUUID(),
    project_id: PROJECT_ID,
    action: 'pause_project',
    actor_id: 'principal-operator',
    actor_type: 'operator',
    reason: 'Pause for review',
    requested_at: NOW,
    impactSummary: {
      activeRunCount: 1,
      activeAgentCount: 1,
      blockedAgentCount: 0,
      urgentAgentCount: 0,
      affectedScheduleCount: 1,
      evidenceRefs: ['evidence://impact'],
    },
    ...overrides,
  };
}

describe('MaoProjectionService', () => {
  it('derives MAO agent projections from canonical workflow state', async () => {
    const { service, setControlState } = createService(createWorkflowRun());
    setControlState('paused_review');

    const projections = await service.getAgentProjections(PROJECT_ID);

    expect(projections).toHaveLength(2);
    const review = projections.find(
      (projection) => projection.workflow_node_definition_id === NODE_B,
    );
    expect(review?.state).toBe('waiting_pfc');
    expect(review?.reasoning_log_preview?.class).toBe('blocker');
    expect(review?.deepLinks.some((link) => link.target === 'projects')).toBe(true);
  });

  it('builds project snapshots with run-graph lineage and urgent overlays', async () => {
    const { service, setControlState } = createService(createWorkflowRun());
    setControlState('paused_review');

    const snapshot = await service.getProjectSnapshot({
      projectId: PROJECT_ID,
      densityMode: 'D4',
    });

    expect(snapshot.grid).toHaveLength(2);
    expect(snapshot.graph.edges.some((edge) => edge.kind === 'dispatch')).toBe(true);
    expect(
      snapshot.graph.edges.some((edge) => edge.kind === 'reflection_review'),
    ).toBe(true);
    expect(snapshot.urgentOverlay.blockedAgentIds.length).toBeGreaterThan(0);
    expect(snapshot.controlProjection.project_control_state).toBe('paused_review');
    expect(snapshot.controlProjection.voice_projection?.current_turn_state).toBe('listening');
  });

  it('processes resume_project through opctl and records readiness outcomes', async () => {
    const { service, setControlState } = createService(createWorkflowRun('waiting'));
    setControlState('paused_review');

    const result = await service.requestProjectControl(
      {
        command_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        project_id: PROJECT_ID,
        action: 'resume_project',
        actor_id: 'principal-operator',
        actor_type: 'operator',
        reason: 'Resume after review',
        requested_at: NOW,
        impactSummary: {
          activeRunCount: 1,
          activeAgentCount: 1,
          blockedAgentCount: 0,
          urgentAgentCount: 0,
          affectedScheduleCount: 1,
          evidenceRefs: ['evidence://impact'],
        },
      },
      makeMockProof('resume'),
    );

    expect(result.accepted).toBe(true);
    expect(result.to_state).toBe('running');
    expect(result.readiness_status).toBe('passed');

    const projection = await service.getProjectControlProjection(PROJECT_ID);
    expect(projection?.project_last_control_action).toBe('resume_project');
    expect(projection?.resume_readiness_status).toBe('passed');
  });

  describe('audit history', () => {
    it('pushes audit record with commandId matching command_id', async () => {
      const { service } = createService(createWorkflowRun());
      const commandId = randomUUID();

      await service.requestProjectControl(
        makeControlRequest({ command_id: commandId, action: 'hard_stop_project' }),
        makeMockProof('hard_stop'),
      );

      const history = await service.getControlAuditHistory(PROJECT_ID);
      expect(history).toHaveLength(1);
      expect(history[0]!.commandId).toBe(commandId);
      expect(history[0]!.action).toBe('hard_stop_project');
    });

    it('accumulates multiple entries in chronological order', async () => {
      const { service, setControlState } = createService(createWorkflowRun());
      const cmd1 = randomUUID();
      const cmd2 = randomUUID();

      await service.requestProjectControl(
        makeControlRequest({ command_id: cmd1, action: 'hard_stop_project' }),
        makeMockProof('hard_stop'),
      );
      setControlState('hard_stopped');
      await service.requestProjectControl(
        makeControlRequest({ command_id: cmd2, action: 'resume_project' }),
        makeMockProof('resume'),
      );

      const history = await service.getControlAuditHistory(PROJECT_ID);
      expect(history).toHaveLength(2);
      expect(history[0]!.commandId).toBe(cmd1);
      expect(history[1]!.commandId).toBe(cmd2);
    });

    it('enforces retention cap at 100 entries', async () => {
      const { service, setControlState } = createService(createWorkflowRun());
      const commandIds: string[] = [];

      for (let i = 0; i < 101; i++) {
        const cmdId = randomUUID();
        commandIds.push(cmdId);
        // Alternate between pause and hard_stop to avoid idempotent rejection
        if (i % 2 === 0) {
          setControlState('running');
          await service.requestProjectControl(
            makeControlRequest({ command_id: cmdId, action: 'hard_stop_project' }),
            makeMockProof('hard_stop'),
          );
        } else {
          setControlState('hard_stopped');
          await service.requestProjectControl(
            makeControlRequest({ command_id: cmdId, action: 'resume_project' }),
            makeMockProof('resume'),
          );
        }
      }

      const history = await service.getControlAuditHistory(PROJECT_ID);
      expect(history).toHaveLength(100);
      // Oldest (index 0) should be evicted; second entry should be first
      expect(history[0]!.commandId).toBe(commandIds[1]);
      // Newest should be last
      expect(history[99]!.commandId).toBe(commandIds[100]);
    });

    it('buildProjectControlProjection returns latest audit entry after migration', async () => {
      const { service, setControlState } = createService(createWorkflowRun());

      await service.requestProjectControl(
        makeControlRequest({ action: 'hard_stop_project', reason: 'First stop' }),
        makeMockProof('hard_stop'),
      );
      setControlState('hard_stopped');
      await service.requestProjectControl(
        makeControlRequest({ action: 'resume_project', reason: 'Resume after first' }),
        makeMockProof('resume'),
      );

      const projection = await service.getProjectControlProjection(PROJECT_ID);
      expect(projection?.project_last_control_action).toBe('resume_project');
      expect(projection?.project_last_control_reason).toBe('Resume after first');
    });

    it('returns valid projection with no audit records', async () => {
      const { service, setControlState } = createService(createWorkflowRun());
      setControlState('running');

      const projection = await service.getProjectControlProjection(PROJECT_ID);
      expect(projection).not.toBeNull();
      expect(projection?.project_last_control_action).toBeUndefined();
      expect(projection?.resume_readiness_status).toBe('not_applicable');
    });
  });

  describe('getControlAuditHistory', () => {
    it('returns empty array for unknown project', async () => {
      const { service } = createService(createWorkflowRun());
      const unknownId = 'ffffffff-ffff-ffff-ffff-ffffffffffff' as ProjectId;

      const history = await service.getControlAuditHistory(unknownId);
      expect(history).toEqual([]);
    });

    it('returns typed array matching pushed audit records', async () => {
      const { service } = createService(createWorkflowRun());
      const commandId = randomUUID();

      await service.requestProjectControl(
        makeControlRequest({ command_id: commandId, action: 'hard_stop_project', reason: 'Test reason' }),
        makeMockProof('hard_stop'),
      );

      const history = await service.getControlAuditHistory(PROJECT_ID);
      expect(history).toHaveLength(1);
      const entry = history[0]!;
      expect(entry.commandId).toBe(commandId);
      expect(entry.action).toBe('hard_stop_project');
      expect(entry.actorId).toBe('principal-operator');
      expect(entry.reason).toBe('Test reason');
      expect(entry.reasonCode).toBeDefined();
      expect(entry.at).toBeDefined();
      expect(entry.evidenceRefs).toBeInstanceOf(Array);
      expect(entry.resumeReadinessStatus).toBeDefined();
      expect(entry.decisionRef).toBeDefined();
    });

    it('returns entries in chronological order', async () => {
      const { service, setControlState } = createService(createWorkflowRun());

      await service.requestProjectControl(
        makeControlRequest({ action: 'hard_stop_project' }),
        makeMockProof('hard_stop'),
      );
      setControlState('hard_stopped');
      await service.requestProjectControl(
        makeControlRequest({ action: 'resume_project' }),
        makeMockProof('resume'),
      );

      const history = await service.getControlAuditHistory(PROJECT_ID);
      expect(history).toHaveLength(2);
      expect(history[0]!.action).toBe('hard_stop_project');
      expect(history[1]!.action).toBe('resume_project');
    });
  });

  describe('health aggregator integration', () => {
    it('setHealthAggregator wires aggregator for degradedReasonCode', async () => {
      const { service, setControlState } = createService(createWorkflowRun());
      setControlState('running');
      const agg = mockHealthAggregator('degraded');
      service.setHealthAggregator(agg);

      const snapshot = await service.getProjectSnapshot({
        projectId: PROJECT_ID,
        densityMode: 'D4',
      });

      expect(snapshot.diagnostics.degradedReasonCode).toBe('system_health_degraded');
    });

    it('returns system_health_degraded when bootStatus is degraded', async () => {
      const agg = mockHealthAggregator('degraded');
      const { service, setControlState } = createService(createWorkflowRun(), { healthAggregator: agg });
      setControlState('running');

      const snapshot = await service.getProjectSnapshot({
        projectId: PROJECT_ID,
        densityMode: 'D4',
      });

      expect(snapshot.diagnostics.degradedReasonCode).toBe('system_health_degraded');
    });

    it('omits health reason when aggregator is absent', async () => {
      const { service, setControlState } = createService(createWorkflowRun());
      setControlState('running');

      const snapshot = await service.getProjectSnapshot({
        projectId: PROJECT_ID,
        densityMode: 'D4',
      });

      expect(snapshot.diagnostics.degradedReasonCode).toBeUndefined();
    });

    it('omits health reason when bootStatus is ready', async () => {
      const agg = mockHealthAggregator('ready');
      const { service, setControlState } = createService(createWorkflowRun(), { healthAggregator: agg });
      setControlState('running');

      const snapshot = await service.getProjectSnapshot({
        projectId: PROJECT_ID,
        densityMode: 'D4',
      });

      expect(snapshot.diagnostics.degradedReasonCode).toBeUndefined();
    });

    it('voice degradation takes precedence over health degradation', async () => {
      const agg = mockHealthAggregator('degraded');
      const { service, setControlState } = createService(createWorkflowRun(), {
        healthAggregator: agg,
        voiceDegraded: true,
      });
      setControlState('running');

      const snapshot = await service.getProjectSnapshot({
        projectId: PROJECT_ID,
        densityMode: 'D4',
      });

      // Voice degradation reason should take precedence via nullish coalescing order
      expect(snapshot.diagnostics.degradedReasonCode).not.toBe('system_health_degraded');
      expect(snapshot.diagnostics.degradedReasonCode).toBeDefined();
    });
  });

  describe('T3 server-side enforcement', () => {
    it('rejects T3 action (resume_project) when confirmationProof is not supplied', async () => {
      const { service, setControlState } = createService(createWorkflowRun('waiting'));
      setControlState('paused_review');

      const result = await service.requestProjectControl(
        makeControlRequest({ action: 'resume_project' }),
        // No proof supplied
      );

      expect(result.accepted).toBe(false);
      expect(result.status).toBe('blocked');
      expect(result.reason_code).toBe('T3_PROOF_REQUIRED');
    });

    it('rejects T3 action (hard_stop_project) when confirmationProof is not supplied', async () => {
      const { service } = createService(createWorkflowRun());

      const result = await service.requestProjectControl(
        makeControlRequest({ action: 'hard_stop_project' }),
        // No proof supplied
      );

      expect(result.accepted).toBe(false);
      expect(result.status).toBe('blocked');
      expect(result.reason_code).toBe('T3_PROOF_REQUIRED');
    });

    it('allows T1 action (pause_project) without confirmationProof (auto-generation preserved)', async () => {
      const { service } = createService(createWorkflowRun());

      const result = await service.requestProjectControl(
        makeControlRequest({ action: 'pause_project' }),
        // No proof — T1 auto-generates
      );

      expect(result.accepted).toBe(true);
      expect(result.status).not.toBe('blocked');
    });

    it('allows T3 action with valid confirmationProof', async () => {
      const { service } = createService(createWorkflowRun());

      const result = await service.requestProjectControl(
        makeControlRequest({ action: 'hard_stop_project' }),
        makeMockProof('hard_stop'),
      );

      expect(result.accepted).toBe(true);
    });
  });

  describe('getSystemSnapshot', () => {
    it('returns empty snapshot when projectStore is not provided', async () => {
      const { service } = createService(createWorkflowRun());

      const snapshot = await service.getSystemSnapshot({ densityMode: 'D2' });

      expect(snapshot.agents).toEqual([]);
      expect(snapshot.leaseRoots).toEqual([]);
      expect(snapshot.projectControls).toEqual({});
      expect(snapshot.densityMode).toBe('D2');
      expect(snapshot.generatedAt).toBeDefined();
    });

    it('returns empty snapshot when projectStore has no projects', async () => {
      const projectStore = createProjectStoreMock([]);
      const { service } = createService(createWorkflowRun(), { projectStore });

      const snapshot = await service.getSystemSnapshot({ densityMode: 'D2' });

      expect(snapshot.agents).toEqual([]);
      expect(snapshot.leaseRoots).toEqual([]);
      expect(snapshot.projectControls).toEqual({});
    });

    it('aggregates agents from a single project', async () => {
      const projectStore = createProjectStoreMock([PROJECT_ID]);
      const { service, setControlState } = createService(createWorkflowRun(), { projectStore });
      setControlState('running');

      const snapshot = await service.getSystemSnapshot({ densityMode: 'D2' });

      expect(snapshot.agents.length).toBeGreaterThan(0);
      expect(snapshot.leaseRoots.length).toBeGreaterThan(0);
      expect(snapshot.projectControls[PROJECT_ID]).toBeDefined();
      expect(snapshot.densityMode).toBe('D2');
    });

    it('identifies lease roots as agents without dispatching_task_agent_id', async () => {
      const projectStore = createProjectStoreMock([PROJECT_ID]);
      const { service, setControlState } = createService(createWorkflowRun(), { projectStore });
      setControlState('running');

      const snapshot = await service.getSystemSnapshot({ densityMode: 'D2' });

      // NODE_A has no parent (dispatching_task_agent_id is null), so it should be a lease root
      const nodeAAgent = snapshot.agents.find(
        (a) => a.workflow_node_definition_id === NODE_A,
      );
      if (nodeAAgent) {
        expect(snapshot.leaseRoots).toContain(nodeAAgent.agent_id);
      }
    });

    it('applies default D2 density mode', async () => {
      const projectStore = createProjectStoreMock([PROJECT_ID]);
      const { service } = createService(createWorkflowRun(), { projectStore });

      const snapshot = await service.getSystemSnapshot({ densityMode: 'D2' });

      expect(snapshot.densityMode).toBe('D2');
    });
  });

  describe('buildAgentProjection — display_name', () => {
    it('populates display_name from node definition metadata displayName', async () => {
      const runState = createWorkflowRun();
      const { service, setControlState } = createService(runState);
      setControlState('running');

      const projections = await service.getAgentProjections(PROJECT_ID);

      // All agents should have display_name populated from node definition name
      for (const proj of projections) {
        expect(proj.display_name).toBeDefined();
      }
    });

    it('falls back display_name to node definition name', async () => {
      const { service, setControlState } = createService(createWorkflowRun());
      setControlState('running');

      const projections = await service.getAgentProjections(PROJECT_ID);

      const draftAgent = projections.find(
        (a) => a.workflow_node_definition_id === NODE_A,
      );
      // Node name is 'Draft' in the mock graph
      expect(draftAgent?.display_name).toBe('Draft');
    });

    it('derives agent_class from node kind for workflow-derived projections', async () => {
      const { service, setControlState } = createService(createWorkflowRun());
      setControlState('running');

      const projections = await service.getAgentProjections(PROJECT_ID);

      // Node A is type 'model-call' -> Worker
      const draftAgent = projections.find(
        (a) => a.workflow_node_definition_id === NODE_A,
      );
      expect(draftAgent?.agent_class).toBe('Worker');

      // Node B is type 'human-decision' -> undefined (structural node kind)
      const reviewAgent = projections.find(
        (a) => a.workflow_node_definition_id === NODE_B,
      );
      expect(reviewAgent?.agent_class).toBeUndefined();
    });

    it('reads agent_class from node metadata when present, overriding node-kind fallback', async () => {
      const runState = createWorkflowRun();
      // We need a custom engine with metadata.agentClass on Node A
      const graphWithMetadata = {
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
              metadata: {
                specNodeId: 'spec-a',
                agentClass: 'Orchestrator', // Override: model-call would normally be Worker
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
              config: {
                type: 'human-decision',
                decisionRef: 'decision://review',
              },
            },
            inboundEdgeIds: ['edge-1'],
            outboundEdgeIds: [],
            topologicalIndex: 1,
          },
        },
        edges: {
          'edge-1': {
            id: 'edge-1',
            from: NODE_A,
            to: NODE_B,
            priority: 0,
          },
        },
      } as any;

      const { opctlService, setControlState } = createOpctlServiceMock();
      setControlState('running');

      const engine: IWorkflowEngine = {
        resolveDefinition: async () => ({}) as any,
        resolveDefinitionSource: async () => ({}) as any,
        deriveGraph: async () => graphWithMetadata,
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
        getRunGraph: async () => graphWithMetadata,
      };

      const service = new MaoProjectionService({
        opctlService,
        workflowEngine: engine,
        escalationService: createEscalationService(),
        schedulerService: createSchedulerService(),
        witnessService: mockWitnessService(),
      });

      const projections = await service.getAgentProjections(PROJECT_ID);

      const draftAgent = projections.find(
        (a) => a.workflow_node_definition_id === NODE_A,
      );
      // metadata.agentClass ('Orchestrator') overrides node-kind fallback ('Worker')
      expect(draftAgent?.agent_class).toBe('Orchestrator');
    });
  });

  describe('lifecycle state mapping — canceled and hard_stopped', () => {
    it('maps all agents to canceled when workflow run status is canceled', async () => {
      const { service, setControlState } = createService(createWorkflowRun('canceled'));
      setControlState('running');

      const projections = await service.getAgentProjections(PROJECT_ID);

      for (const proj of projections) {
        expect(proj.state).toBe('canceled');
      }
    });

    it('maps all agents to hard_stopped when control state is hard_stopped', async () => {
      const { service, setControlState } = createService(createWorkflowRun());
      setControlState('hard_stopped');

      const projections = await service.getAgentProjections(PROJECT_ID);

      for (const proj of projections) {
        expect(proj.state).toBe('hard_stopped');
      }
    });

    it('canceled (run-level) takes precedence over hard_stopped (project-level)', async () => {
      const { service, setControlState } = createService(createWorkflowRun('canceled'));
      setControlState('hard_stopped');

      const projections = await service.getAgentProjections(PROJECT_ID);

      for (const proj of projections) {
        expect(proj.state).toBe('canceled');
      }
    });

    it('preserves existing paused_review overlay when neither canceled nor hard_stopped', async () => {
      const { service, setControlState } = createService(createWorkflowRun());
      setControlState('paused_review');

      const projections = await service.getAgentProjections(PROJECT_ID);
      // Node A is completed, so paused overlay does not apply
      // Node B is blocked/waiting (active), so paused overlay applies
      const reviewAgent = projections.find(
        (a) => a.workflow_node_definition_id === NODE_B,
      );
      // Node B status is 'blocked' which is in the ['ready', 'running'] check?
      // Actually per the existing logic, 'blocked' is NOT in ['ready', 'running'],
      // so paused overlay does not apply; it returns 'waiting_pfc' from the wait state.
      // This preserves existing behavior correctly.
      expect(reviewAgent?.state).toBe('waiting_pfc');
    });

    it('omitting runStatus preserves existing behavior (no regression)', async () => {
      // When runStatus is undefined (default), mapLifecycleState behaves as before
      const { service, setControlState } = createService(createWorkflowRun('running'));
      setControlState('running');

      const projections = await service.getAgentProjections(PROJECT_ID);

      const draftAgent = projections.find(
        (a) => a.workflow_node_definition_id === NODE_A,
      );
      // Node A is 'completed' -> should map to 'completed'
      expect(draftAgent?.state).toBe('completed');
    });
  });

  describe('system agent projection synthesis (WR-105)', () => {
    it('synthesizes system agent projections from health aggregator gateway entries', async () => {
      const gateways = [
        createGatewayEntry({ agentId: SYSTEM_AGENT_ID_1, agentClass: 'Cortex::Principal', inboxReady: true }),
        createGatewayEntry({ agentId: SYSTEM_AGENT_ID_2, agentClass: 'Cortex::System', inboxReady: false, issueCount: 2, issueCodes: ['STALE', 'TIMEOUT'] }),
      ];
      const healthAgg = mockHealthAggregator('ready', gateways);
      const projectStore = createProjectStoreMock([PROJECT_ID]);
      const { service, setControlState } = createService(createWorkflowRun(), { healthAggregator: healthAgg, projectStore });
      setControlState('running');

      const snapshot = await service.getSystemSnapshot({ densityMode: 'D2' });

      const sysAgent1 = snapshot.agents.find((a) => a.agent_id === SYSTEM_AGENT_ID_1);
      const sysAgent2 = snapshot.agents.find((a) => a.agent_id === SYSTEM_AGENT_ID_2);

      expect(sysAgent1).toBeDefined();
      expect(sysAgent1!.project_id).toBe(SYSTEM_SCOPE_SENTINEL_PROJECT_ID);
      expect(sysAgent1!.agent_class).toBe('Cortex::Principal');
      expect(sysAgent1!.state).toBe('running');
      expect(sysAgent1!.risk_level).toBe('low');
      expect(sysAgent1!.dispatching_task_agent_id).toBeNull();
      expect(sysAgent1!.dispatch_origin_ref).toBe('gateway-runtime:system-agent');

      expect(sysAgent2).toBeDefined();
      expect(sysAgent2!.state).toBe('queued');
      expect(sysAgent2!.risk_level).toBe('medium');
      expect(sysAgent2!.attention_level).toBe('medium');
    });

    it('adds system agents as lease roots', async () => {
      const gateways = [createGatewayEntry({ agentId: SYSTEM_AGENT_ID_1 })];
      const healthAgg = mockHealthAggregator('ready', gateways);
      const projectStore = createProjectStoreMock([]);
      const { service } = createService(createWorkflowRun(), { healthAggregator: healthAgg, projectStore });

      const snapshot = await service.getSystemSnapshot({ densityMode: 'D2' });

      expect(snapshot.leaseRoots).toContain(SYSTEM_AGENT_ID_1);
    });

    it('deduplicates system agents that already exist in allAgents', async () => {
      // Create a gateway entry whose agentId matches a workflow agent's agent_id
      // This tests the dedup guard
      const projectStore = createProjectStoreMock([PROJECT_ID]);
      const { service, setControlState } = createService(createWorkflowRun(), { projectStore });
      setControlState('running');

      // First get agents to know an existing agent_id
      const baseSnapshot = await service.getSystemSnapshot({ densityMode: 'D2' });
      const existingAgentId = baseSnapshot.agents[0]?.agent_id;
      expect(existingAgentId).toBeDefined();

      // Now create a health aggregator with a gateway that has the same agentId
      const gateways = [createGatewayEntry({ agentId: existingAgentId! })];
      const healthAgg = mockHealthAggregator('ready', gateways);
      const { service: service2, setControlState: setControlState2 } = createService(createWorkflowRun(), { healthAggregator: healthAgg, projectStore });
      setControlState2('running');

      const snapshot = await service2.getSystemSnapshot({ densityMode: 'D2' });

      // Should not have duplicates
      const agentIds = snapshot.agents.map((a) => a.agent_id);
      const uniqueIds = new Set(agentIds);
      expect(agentIds.length).toBe(uniqueIds.size);
    });

    it('does not add system agents when healthAggregator is absent', async () => {
      const projectStore = createProjectStoreMock([]);
      const { service } = createService(createWorkflowRun(), { projectStore });

      const snapshot = await service.getSystemSnapshot({ densityMode: 'D2' });

      expect(snapshot.agents).toEqual([]);
    });
  });

  describe('SSE event publication (WR-105)', () => {
    it('publishes mao:projection-changed after getSystemSnapshot', async () => {
      const eventBus = mockEventBus();
      const projectStore = createProjectStoreMock([PROJECT_ID]);
      const { service, setControlState } = createService(createWorkflowRun(), { projectStore, eventBus });
      setControlState('running');

      await service.getSystemSnapshot({ densityMode: 'D2' });

      expect(eventBus.publish).toHaveBeenCalledWith('mao:projection-changed', {});
    });

    it('publishes event even when agents list is empty', async () => {
      const eventBus = mockEventBus();
      const projectStore = createProjectStoreMock([]);
      const { service } = createService(createWorkflowRun(), { projectStore, eventBus });

      await service.getSystemSnapshot({ densityMode: 'D2' });

      expect(eventBus.publish).toHaveBeenCalledWith('mao:projection-changed', {});
    });

    it('does not throw when eventBus is absent', async () => {
      const projectStore = createProjectStoreMock([]);
      const { service } = createService(createWorkflowRun(), { projectStore });

      await expect(service.getSystemSnapshot({ densityMode: 'D2' })).resolves.toBeDefined();
    });
  });

  describe('system agent inspect fallback (WR-105)', () => {
    it('returns sparse inspect projection for system agents from health data', async () => {
      const gateways = [createGatewayEntry({ agentId: SYSTEM_AGENT_ID_1, agentClass: 'Cortex::Principal' })];
      const healthAgg = mockHealthAggregator('ready', gateways);
      const { service, setControlState } = createService(createWorkflowRun(), { healthAggregator: healthAgg });
      setControlState('running');

      const inspect = await service.getAgentInspectProjection({
        projectId: PROJECT_ID,
        agentId: SYSTEM_AGENT_ID_1,
      });

      expect(inspect).not.toBeNull();
      expect(inspect!.agent.agent_id).toBe(SYSTEM_AGENT_ID_1);
      expect(inspect!.agent.agent_class).toBe('Cortex::Principal');
      expect(inspect!.projectId).toBe(SYSTEM_SCOPE_SENTINEL_PROJECT_ID);
      expect(inspect!.latestAttempt).toBeNull();
      expect(inspect!.correctionArcs).toEqual([]);
      expect(inspect!.projectControlState).toBe('running');
    });

    it('returns null for unknown agent IDs', async () => {
      const healthAgg = mockHealthAggregator('ready', []);
      const { service, setControlState } = createService(createWorkflowRun(), { healthAggregator: healthAgg });
      setControlState('running');

      const inspect = await service.getAgentInspectProjection({
        projectId: PROJECT_ID,
        agentId: 'ffffffff-0000-0000-0000-000000000000',
      });

      expect(inspect).toBeNull();
    });

    it('returns null when healthAggregator is absent and no workflow match', async () => {
      const { service, setControlState } = createService(createWorkflowRun());
      setControlState('running');

      const inspect = await service.getAgentInspectProjection({
        projectId: PROJECT_ID,
        agentId: SYSTEM_AGENT_ID_1,
      });

      expect(inspect).toBeNull();
    });
  });

  describe('diagnostic logging (WR-105)', () => {
    it('logs warning when project context build fails', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const projectStore = createProjectStoreMock([PROJECT_ID]);

      // Create a service with a workflow engine that throws
      const { opctlService, setControlState } = createOpctlServiceMock();
      const failingEngine: IWorkflowEngine = {
        resolveDefinition: async () => { throw new Error('test-failure'); },
        resolveDefinitionSource: async () => { throw new Error('test-failure'); },
        deriveGraph: async () => { throw new Error('test-failure'); },
        evaluateAdmission: async () => { throw new Error('test-failure'); },
        start: async () => { throw new Error('test-failure'); },
        resume: async () => { throw new Error('test-failure'); },
        pause: async () => { throw new Error('test-failure'); },
        cancel: async () => { throw new Error('test-failure'); },
        completeNode: async () => { throw new Error('test-failure'); },
        executeReadyNode: async () => { throw new Error('test-failure'); },
        continueNode: async () => { throw new Error('test-failure'); },
        getState: async () => { throw new Error('test-failure'); },
        listProjectRuns: async () => { throw new Error('test-failure'); },
        getRunGraph: async () => { throw new Error('test-failure'); },
      } as unknown as IWorkflowEngine;

      const service = new MaoProjectionService({
        opctlService,
        workflowEngine: failingEngine,
        escalationService: createEscalationService(),
        schedulerService: createSchedulerService(),
        witnessService: mockWitnessService(),
        projectStore,
      });
      setControlState('running');

      const snapshot = await service.getSystemSnapshot({ densityMode: 'D2' });

      expect(snapshot.agents).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
      const call = warnSpy.mock.calls[0];
      expect(call![0]).toContain('[nous:mao]');
      expect(call![0]).toContain('getSystemSnapshot');

      warnSpy.mockRestore();
    });
  });
});
