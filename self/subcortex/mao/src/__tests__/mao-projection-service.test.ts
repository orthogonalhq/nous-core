import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type {
  ConfirmationProof,
  IEscalationService,
  IHealthAggregator,
  IOpctlService,
  IScheduler,
  IWorkflowEngine,
  ProjectId,
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
            modelRole: 'reasoner',
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

function mockHealthAggregator(bootStatus: 'booting' | 'ready' | 'degraded' = 'ready'): IHealthAggregator {
  return {
    getProviderHealth: () => ({
      providers: [],
      collectedAt: NOW,
    }) as any,
    getAgentStatus: () => ({
      gateways: [],
      sessions: [],
      collectedAt: NOW,
    }) as any,
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

function createService(runState: WorkflowRunState, opts?: { healthAggregator?: IHealthAggregator; voiceDegraded?: boolean }) {
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
});
