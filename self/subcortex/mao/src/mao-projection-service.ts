import { createHash, randomUUID } from 'node:crypto';
import type {
  ConfirmationProof,
  ControlActorType,
  IEscalationService,
  IOpctlService,
  IProjectStore,
  IScheduler,
  IVoiceControlService,
  IWorkflowEngine,
  IWitnessService,
  MaoAgentInspectInput,
  MaoAgentInspectProjection,
  MaoAgentProjection,
  MaoEventType,
  MaoProjectControlAction,
  MaoProjectControlProjection,
  MaoProjectControlRequest,
  MaoProjectControlResult,
  MaoProjectSnapshot,
  MaoProjectSnapshotInput,
  MaoRunGraphEdge,
  MaoRunGraphNode,
  MaoRunGraphSnapshot,
  MaoSystemSnapshot,
  MaoSystemSnapshotInput,
  ProjectControlState,
  ProjectId,
  WorkflowNodeRunState,
  WorkflowRunState,
  IHealthAggregator,
  MaoControlAuditHistoryEntry,
} from '@nous/shared';
import {
  MaoAgentInspectInputSchema,
  MaoAgentInspectProjectionSchema,
  MaoAgentProjectionSchema,
  MaoProjectControlProjectionSchema,
  MaoProjectControlRequestSchema,
  MaoProjectControlResultSchema,
  MaoProjectSnapshotInputSchema,
  MaoProjectSnapshotSchema,
  MaoRunGraphSnapshotSchema,
  MaoSystemSnapshotInputSchema,
  MaoSystemSnapshotSchema,
} from '@nous/shared';

type ControlAuditRecord = {
  commandId: string;
  action: MaoProjectControlAction;
  actorId: string;
  reason: string;
  reasonCode: string;
  at: string;
  evidenceRefs: string[];
  resumeReadinessStatus: 'not_applicable' | 'pending' | 'passed' | 'blocked';
  decisionRef: string;
};

type ProjectionContext = {
  projectId: ProjectId;
  densityMode: MaoProjectSnapshotInput['densityMode'];
  generatedAt: string;
  controlState: ProjectControlState;
  runs: WorkflowRunState[];
  selectedRun: WorkflowRunState | null;
  selectedGraph: Awaited<ReturnType<IWorkflowEngine['getRunGraph']>>;
  agentProjections: MaoAgentProjection[];
  runGraph: MaoRunGraphSnapshot;
  urgentAgentIds: string[];
  blockedAgentIds: string[];
  degradedReasonCode?: string;
  voiceProjection?: NonNullable<MaoProjectControlProjection['voice_projection']>;
};

const ACTIVE_RUN_STATUSES = new Set([
  'ready',
  'running',
  'waiting',
  'blocked_review',
  'paused',
]);

const WAITING_REASON_CODES = new Set([
  'workflow_wait_paused_review',
  'workflow_wait_resuming',
  'workflow_resume_review_required',
]);

function nowIso(): string {
  return new Date().toISOString();
}

function hashPayload(payload: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function mapActorType(
  actorType: MaoProjectControlRequest['actor_type'],
): ControlActorType {
  return actorType === 'nous_cortex' ? 'orchestration_agent' : 'principal';
}

function mapAction(action: MaoProjectControlAction): {
  controlAction: 'pause' | 'resume' | 'hard_stop';
  tier: 'T1' | 'T3';
} {
  switch (action) {
    case 'pause_project':
      return { controlAction: 'pause', tier: 'T1' };
    case 'resume_project':
      return { controlAction: 'resume', tier: 'T3' };
    case 'hard_stop_project':
      return { controlAction: 'hard_stop', tier: 'T3' };
  }
}

function selectRun(
  runs: WorkflowRunState[],
  workflowRunId?: WorkflowRunState['runId'],
): WorkflowRunState | null {
  if (workflowRunId) {
    return runs.find((run) => run.runId === workflowRunId) ?? null;
  }
  return runs.find((run) => ACTIVE_RUN_STATUSES.has(run.status)) ?? runs[0] ?? null;
}

function buildProgressPercent(
  nodeState: WorkflowNodeRunState,
  totalNodeCount: number,
  completedNodeCount: number,
): number {
  if (nodeState.status === 'completed' || nodeState.status === 'skipped') {
    return 100;
  }
  const base = totalNodeCount > 0
    ? Math.round((completedNodeCount / totalNodeCount) * 100)
    : 0;
  switch (nodeState.status) {
    case 'blocked':
      return Math.max(base, 85);
    case 'waiting':
      return Math.max(base, 75);
    case 'running':
      return Math.max(base, 55);
    case 'ready':
      return Math.max(base, 20);
    case 'failed':
      return Math.max(base, 90);
    default:
      return base;
  }
}

function isPfcWait(nodeState: WorkflowNodeRunState): boolean {
  return (
    nodeState.activeWaitState?.kind === 'human_decision' ||
    (nodeState.reasonCode != null &&
      (WAITING_REASON_CODES.has(nodeState.reasonCode) ||
        /review|paused_review|resuming/i.test(nodeState.reasonCode)))
  );
}

function mapLifecycleState(
  nodeState: WorkflowNodeRunState,
  controlState: ProjectControlState,
): MaoAgentProjection['state'] {
  if (
    controlState === 'paused_review' &&
    ['ready', 'running'].includes(nodeState.status)
  ) {
    return 'paused';
  }
  if (
    controlState === 'resuming' &&
    ['ready', 'running'].includes(nodeState.status)
  ) {
    return 'resuming';
  }

  switch (nodeState.status) {
    case 'pending':
      return 'queued';
    case 'ready':
      return 'ready';
    case 'running':
      return 'running';
    case 'waiting':
      return isPfcWait(nodeState) ? 'waiting_pfc' : 'waiting_async';
    case 'blocked':
      return isPfcWait(nodeState) ? 'waiting_pfc' : 'blocked';
    case 'failed':
      return 'failed';
    case 'completed':
    case 'skipped':
      return 'completed';
    default:
      return 'queued';
  }
}

function deriveRiskLevel(
  state: MaoAgentProjection['state'],
): MaoAgentProjection['risk_level'] {
  switch (state) {
    case 'failed':
      return 'critical';
    case 'blocked':
    case 'waiting_pfc':
      return 'high';
    case 'paused':
    case 'resuming':
    case 'waiting_async':
      return 'medium';
    default:
      return 'low';
  }
}

function deriveUrgencyLevel(
  state: MaoAgentProjection['state'],
): MaoAgentProjection['urgency_level'] {
  switch (state) {
    case 'failed':
    case 'blocked':
      return 'urgent';
    case 'waiting_pfc':
    case 'paused':
    case 'resuming':
      return 'elevated';
    default:
      return 'normal';
  }
}

function deriveAttentionLevel(
  urgency: MaoAgentProjection['urgency_level'],
  state: MaoAgentProjection['state'],
): MaoAgentProjection['attention_level'] {
  if (urgency === 'urgent') {
    return 'urgent';
  }
  if (urgency === 'elevated') {
    return state === 'waiting_pfc' ? 'high' : 'medium';
  }
  return state === 'running' ? 'low' : 'none';
}

function buildDeepLinks(
  projectId: ProjectId,
  runId: WorkflowRunState['runId'] | undefined,
  nodeDefinitionId: string | undefined,
  dispatchLineageId: string | undefined,
  evidenceRef: string | undefined,
): MaoAgentProjection['deepLinks'] {
  return [
    {
      target: 'mao',
      projectId,
      workflowRunId: runId,
      nodeDefinitionId:
        nodeDefinitionId as import('@nous/shared').WorkflowNodeDefinitionId | undefined,
      dispatchLineageId:
        dispatchLineageId as import('@nous/shared').WorkflowDispatchLineageId | undefined,
      evidenceRef,
    },
    {
      target: 'projects',
      projectId,
      workflowRunId: runId,
      nodeDefinitionId:
        nodeDefinitionId as import('@nous/shared').WorkflowNodeDefinitionId | undefined,
      dispatchLineageId:
        dispatchLineageId as import('@nous/shared').WorkflowDispatchLineageId | undefined,
      evidenceRef,
    },
    {
      target: 'chat',
      projectId,
      workflowRunId: runId,
      nodeDefinitionId:
        nodeDefinitionId as import('@nous/shared').WorkflowNodeDefinitionId | undefined,
      dispatchLineageId:
        dispatchLineageId as import('@nous/shared').WorkflowDispatchLineageId | undefined,
      evidenceRef,
    },
    {
      target: 'traces',
      projectId,
      workflowRunId: runId,
      nodeDefinitionId:
        nodeDefinitionId as import('@nous/shared').WorkflowNodeDefinitionId | undefined,
      dispatchLineageId:
        dispatchLineageId as import('@nous/shared').WorkflowDispatchLineageId | undefined,
      evidenceRef,
    },
  ];
}

function buildReasoningPreview(
  projectId: ProjectId,
  run: WorkflowRunState,
  nodeDefinitionId: string,
  nodeState: WorkflowNodeRunState,
): MaoAgentProjection['reasoning_log_preview'] {
  const latestAttempt = nodeState.attempts[nodeState.attempts.length - 1];
  const evidenceRef =
    nodeState.evidenceRefs[0] ??
    latestAttempt?.evidenceRefs[0] ??
    `workflow-node:${nodeDefinitionId}`;
  const emittedAt =
    nodeState.updatedAt ?? latestAttempt?.completedAt ?? latestAttempt?.updatedAt;
  if (!emittedAt) {
    return null;
  }

  const summary =
    nodeState.status === 'failed'
      ? `Execution failed: ${nodeState.reasonCode ?? 'review the latest evidence'}`
      : nodeState.status === 'blocked'
        ? `Execution blocked: ${nodeState.reasonCode ?? 'operator review required'}`
        : nodeState.status === 'waiting'
          ? `Waiting on ${nodeState.activeWaitState?.kind ?? 'continuation'}`
          : nodeState.status === 'completed'
            ? `Step completed: ${nodeState.reasonCode ?? 'workflow progress recorded'}`
            : `Current status: ${nodeState.reasonCode ?? nodeState.status}`;

  const restricted =
    /restricted|private|secret/i.test(nodeState.reasonCode ?? '') ||
    /restricted|private|secret/i.test(summary);

  return {
    class:
      nodeState.status === 'blocked' || nodeState.status === 'failed'
        ? 'blocker'
        : nodeState.status === 'waiting'
          ? 'next_action'
          : 'result_summary',
    summary: restricted
      ? 'Restricted reasoning summary available in inspect view.'
      : summary,
    evidenceRef,
    artifactRefs: latestAttempt?.outputRef ? [latestAttempt.outputRef] : [],
    redactionClass: restricted ? 'restricted' : 'public_operator',
    previewMode: restricted ? 'inspect_only' : 'inline',
    emittedAt,
    chatLink: {
      target: 'chat',
      projectId,
      workflowRunId: run.runId,
      nodeDefinitionId:
        nodeDefinitionId as import('@nous/shared').WorkflowNodeDefinitionId,
      dispatchLineageId:
        nodeState.lastDispatchLineageId as import('@nous/shared').WorkflowDispatchLineageId | undefined,
      evidenceRef,
    },
    projectsLink: {
      target: 'projects',
      projectId,
      workflowRunId: run.runId,
      nodeDefinitionId:
        nodeDefinitionId as import('@nous/shared').WorkflowNodeDefinitionId,
      dispatchLineageId:
        nodeState.lastDispatchLineageId as import('@nous/shared').WorkflowDispatchLineageId | undefined,
      evidenceRef,
    },
  };
}

function buildRunGraph(
  projectId: ProjectId,
  generatedAt: string,
  run: WorkflowRunState | null,
  agentProjections: MaoAgentProjection[],
  controlState: ProjectControlState,
): MaoRunGraphSnapshot {
  const nodeIdByDefinition = new Map<string, string>();
  const nodes: MaoRunGraphNode[] = agentProjections.map((agent) => {
    const id = `agent:${agent.agent_id}`;
    if (agent.workflow_node_definition_id) {
      nodeIdByDefinition.set(agent.workflow_node_definition_id, id);
    }
    return {
      id,
      kind: 'agent',
      agentId: agent.agent_id,
      workflowRunId: agent.workflow_run_id,
      workflowNodeDefinitionId:
        agent.workflow_node_definition_id as import('@nous/shared').WorkflowNodeDefinitionId | undefined,
      label: agent.current_step,
      state: agent.state,
      evidenceRefs: agent.evidenceRefs,
    };
  });
  const edges: MaoRunGraphEdge[] = [];

  if (controlState !== 'running') {
    nodes.push({
      id: `control:${projectId}`,
      kind: 'control_event',
      label: `Project ${controlState}`,
      evidenceRefs: [`project-control:${controlState}`],
    });
  }

  if (run) {
    for (const lineage of run.dispatchLineage) {
      if (!lineage.parentNodeDefinitionId) {
        continue;
      }
      const fromNodeId = nodeIdByDefinition.get(lineage.parentNodeDefinitionId);
      const toNodeId = nodeIdByDefinition.get(lineage.nodeDefinitionId);
      if (!fromNodeId || !toNodeId) {
        continue;
      }
      edges.push({
        id: `dispatch:${lineage.id}`,
        kind: 'dispatch',
        fromNodeId,
        toNodeId,
        dispatchLineageId: lineage.id,
        reasonCode: lineage.reasonCode,
        evidenceRefs:
          lineage.evidenceRefs.length > 0
            ? lineage.evidenceRefs
            : ['workflow_dispatch_lineage_missing_evidence'],
        occurredAt: lineage.occurredAt,
      });
    }

    for (const [nodeDefinitionId, nodeState] of Object.entries(run.nodeStates)) {
      const nodeId = nodeIdByDefinition.get(nodeDefinitionId);
      if (!nodeId) {
        continue;
      }
      for (const arc of nodeState.correctionArcs) {
        edges.push({
          id: `correction:${arc.id}`,
          kind: arc.type,
          fromNodeId: nodeId,
          toNodeId: nodeId,
          reasonCode: arc.reasonCode,
          evidenceRefs: arc.evidenceRefs,
          occurredAt: arc.occurredAt,
        });
      }
      if (isPfcWait(nodeState) || /review/i.test(nodeState.reasonCode ?? '')) {
        edges.push({
          id: `reflection:${nodeState.id}`,
          kind: 'reflection_review',
          fromNodeId: nodeId,
          toNodeId: nodeId,
          reasonCode:
            nodeState.reasonCode ??
            nodeState.activeWaitState?.reasonCode ??
            'workflow_wait_paused_review',
          evidenceRefs:
            nodeState.evidenceRefs.length > 0
              ? nodeState.evidenceRefs
              : ['workflow_reflection_review'],
          occurredAt: nodeState.updatedAt,
        });
      }
    }
  }

  return MaoRunGraphSnapshotSchema.parse({
    projectId,
    workflowRunId: run?.runId,
    nodes,
    edges,
    generatedAt,
  });
}

function buildSummary(agentProjections: MaoAgentProjection[]) {
  return {
    activeAgentCount: agentProjections.filter(
      (agent) => !['completed', 'queued'].includes(agent.state),
    ).length,
    blockedAgentCount: agentProjections.filter((agent) =>
      ['blocked', 'waiting_pfc'].includes(agent.state),
    ).length,
    failedAgentCount: agentProjections.filter((agent) => agent.state === 'failed')
      .length,
    waitingPfcAgentCount: agentProjections.filter(
      (agent) => agent.state === 'waiting_pfc',
    ).length,
    urgentAgentCount: agentProjections.filter(
      (agent) => agent.urgency_level === 'urgent',
    ).length,
  } as const;
}

export interface MaoProjectionServiceDeps {
  opctlService: IOpctlService;
  workflowEngine: IWorkflowEngine;
  escalationService: IEscalationService;
  schedulerService: IScheduler;
  voiceControlService?: IVoiceControlService;
  witnessService?: IWitnessService;
  eventBus?: import('@nous/shared').IEventBus;
  healthAggregator?: IHealthAggregator;
  inferenceAdapter?: import('./inference-projection-adapter.js').InferenceProjectionAdapter;
  projectStore?: IProjectStore;
}

export class MaoProjectionService {
  private static readonly MAX_AUDIT_HISTORY_PER_PROJECT = 100;
  private readonly controlAuditByProject = new Map<ProjectId, ControlAuditRecord[]>();

  constructor(private deps: MaoProjectionServiceDeps) {}

  /**
   * Late-bind the health aggregator for degradedReasonCode derivation.
   * Needed because the HealthAggregator depends on gatewayRuntime which is
   * constructed after MaoProjectionService in the bootstrap sequence.
   */
  setHealthAggregator(aggregator: import('@nous/shared').IHealthAggregator): void {
    this.deps.healthAggregator = aggregator;
  }

  async getAgentProjections(projectId: ProjectId): Promise<MaoAgentProjection[]> {
    const context = await this.buildProjectionContext({
      projectId,
      densityMode: 'D2',
    });
    return context.agentProjections;
  }

  async getProjectControlProjection(
    projectId: ProjectId,
  ): Promise<MaoProjectControlProjection | null> {
    const context = await this.buildProjectionContext({
      projectId,
      densityMode: 'D2',
    });
    return this.buildProjectControlProjection(context);
  }

  async getProjectSnapshot(
    input: MaoProjectSnapshotInput,
  ): Promise<MaoProjectSnapshot> {
    const parsed = MaoProjectSnapshotInputSchema.parse(input);
    const context = await this.buildProjectionContext(parsed);
    const controlProjection = this.buildProjectControlProjection(context);
    const summary = buildSummary(context.agentProjections);

    const snapshot = MaoProjectSnapshotSchema.parse({
      projectId: parsed.projectId,
      densityMode: parsed.densityMode,
      workflowRunId: context.selectedRun?.runId,
      controlProjection,
      grid: context.agentProjections.map((agent) => ({
        agent,
        densityMode: parsed.densityMode,
        clusterKey:
          parsed.densityMode === 'D4' ? `${agent.state}:${agent.urgency_level}` : undefined,
        inspectOnly: parsed.densityMode === 'D3' || parsed.densityMode === 'D4',
        showUrgentOverlay: agent.urgency_level === 'urgent',
      })),
      graph: context.runGraph,
      urgentOverlay: {
        urgentAgentIds: context.urgentAgentIds,
        blockedAgentIds: context.blockedAgentIds,
        generatedAt: context.generatedAt,
      },
      summary,
      diagnostics: {
        runtimePosture: 'single_process_local',
        degradedReasonCode: context.degradedReasonCode,
      },
      generatedAt: context.generatedAt,
    });
    this.deps.eventBus?.publish('mao:projection-changed', {
      projectId: parsed.projectId,
    });
    return snapshot;
  }

  async getAgentInspectProjection(
    input: MaoAgentInspectInput,
  ): Promise<MaoAgentInspectProjection | null> {
    const parsed = MaoAgentInspectInputSchema.parse(input);
    const context = await this.buildProjectionContext({
      projectId: parsed.projectId,
      densityMode: 'D2',
      workflowRunId: parsed.workflowRunId,
    });
    const agent = context.agentProjections.find((candidate) =>
      parsed.agentId
        ? candidate.agent_id === parsed.agentId
        : parsed.nodeDefinitionId
          ? candidate.workflow_node_definition_id === parsed.nodeDefinitionId
          : false,
    );
    if (!agent || !context.selectedRun) {
      return null;
    }

    const nodeDefinitionId = agent.workflow_node_definition_id;
    const nodeState = nodeDefinitionId
      ? context.selectedRun.nodeStates[nodeDefinitionId]
      : undefined;
    const latestAttempt = nodeState?.attempts[nodeState.attempts.length - 1] ?? null;

    return MaoAgentInspectProjectionSchema.parse({
      projectId: parsed.projectId,
      workflowRunId: context.selectedRun.runId,
      workflowNodeDefinitionId: nodeDefinitionId,
      agent,
      projectControlState: context.controlState,
      runStatus: context.selectedRun.status,
      waitKind: nodeState?.activeWaitState?.kind,
      latestAttempt: latestAttempt
        ? {
            attempt: latestAttempt.attempt,
            status: latestAttempt.status,
            reasonCode: latestAttempt.reasonCode,
            evidenceRefs: latestAttempt.evidenceRefs,
            startedAt: latestAttempt.startedAt,
            completedAt: latestAttempt.completedAt,
          }
        : null,
      correctionArcs:
        nodeState?.correctionArcs.map((arc) => ({
          id: arc.id,
          type: arc.type,
          sourceAttempt: arc.sourceAttempt,
          targetAttempt: arc.targetAttempt,
          checkpointId: arc.checkpointId,
          reasonCode: arc.reasonCode,
          evidenceRefs: arc.evidenceRefs,
          occurredAt: arc.occurredAt,
        })) ?? [],
      evidenceRefs: agent.evidenceRefs,
      inference_history: this.deps.inferenceAdapter
        ? (() => {
            const agentClass =
              agent.workflow_node_definition_id ?? agent.agent_id;
            const history = this.deps.inferenceAdapter!.getInferenceHistory({
              agentClass,
              limit: 50,
            });
            return history.length > 0 ? history : undefined;
          })()
        : undefined,
      generatedAt: context.generatedAt,
    });
  }

  async getRunGraphSnapshot(
    input: MaoProjectSnapshotInput,
  ): Promise<MaoRunGraphSnapshot> {
    const parsed = MaoProjectSnapshotInputSchema.parse(input);
    const context = await this.buildProjectionContext(parsed);
    return context.runGraph;
  }

  async requestProjectControl(
    input: MaoProjectControlRequest,
    confirmationProof?: ConfirmationProof,
  ): Promise<MaoProjectControlResult> {
    const parsed = MaoProjectControlRequestSchema.parse(input);
    const fromState = await this.deps.opctlService.getProjectControlState(
      parsed.project_id,
    );

    const preflightRejection = this.evaluateControlRequest(parsed.action, fromState);
    if (preflightRejection) {
      return MaoProjectControlResultSchema.parse({
        command_id: parsed.command_id,
        project_id: parsed.project_id,
        accepted: false,
        status: 'blocked',
        from_state: fromState,
        to_state: fromState,
        reason_code: preflightRejection,
        decision_ref: `mao-control:${parsed.command_id}`,
        impactSummary: parsed.impactSummary,
        evidenceRefs: [`project-control:${fromState}`],
      });
    }

    await this.emitProjectionEvent('mao_project_control_requested', {
      projectId: parsed.project_id,
      action: parsed.action,
      commandId: parsed.command_id,
    });

    const { controlAction, tier } = mapAction(parsed.action);
    const envelopeIssuedAt = nowIso();
    const envelope = {
      control_command_id: parsed.command_id as import('@nous/shared').ControlCommandId,
      actor_type: mapActorType(parsed.actor_type),
      actor_id: randomUUID(),
      actor_session_id: randomUUID(),
      actor_seq: 1,
      nonce: randomUUID(),
      issued_at: envelopeIssuedAt,
      expires_at: new Date(Date.parse(envelopeIssuedAt) + 5 * 60 * 1000).toISOString(),
      scope: {
        class: 'project_run_scope' as const,
        kind: 'project_run' as const,
        target_ids: [],
        project_id: parsed.project_id,
      },
      payload_hash: hashPayload({
        action: parsed.action,
        reason: parsed.reason,
        impactSummary: parsed.impactSummary,
      }),
      command_signature: 'mao-server-sig',
      action: controlAction,
      payload: {
        reason: parsed.reason,
        impactSummary: parsed.impactSummary,
      },
    };
    let proof: ConfirmationProof;
    if (confirmationProof) {
      proof = confirmationProof;
    } else if (tier === 'T3') {
      // T3 requires client-supplied proof; reject without fallback (Phase 1 constraint #3)
      const fromStateNow = await this.deps.opctlService.getProjectControlState(
        parsed.project_id,
      );
      return MaoProjectControlResultSchema.parse({
        command_id: parsed.command_id,
        project_id: parsed.project_id,
        accepted: false,
        status: 'blocked',
        from_state: fromStateNow,
        to_state: fromStateNow,
        reason_code: 'T3_PROOF_REQUIRED',
        decision_ref: `mao-control:${parsed.command_id}`,
        impactSummary: parsed.impactSummary,
        evidenceRefs: [`project-control:${fromStateNow}`],
      });
    } else {
      // T0/T1/T2 auto-generate proof
      proof = await this.deps.opctlService.requestConfirmationProof({
        scope: envelope.scope,
        action: controlAction,
        tier,
        reason: parsed.reason,
      });
    }

    const opctlResult = await this.deps.opctlService.submitCommand(envelope, proof);
    const impactSummary = await this.buildImpactSummary(parsed.project_id);
    let toState = await this.deps.opctlService.getProjectControlState(parsed.project_id);
    let readinessStatus: MaoProjectControlResult['readiness_status'] =
      'not_applicable';
    let reasonCode = opctlResult.reason_code ?? 'mao_project_control_applied';
    const decisionRef = `mao-control:${parsed.command_id}`;
    const evidenceRefs =
      opctlResult.target_ids_hash != null
        ? [`target_ids_hash=${opctlResult.target_ids_hash}`]
        : [`project-control:${toState}`];

    if (opctlResult.status === 'applied' && parsed.action === 'resume_project') {
      const readiness = await this.evaluateResumeReadiness(parsed.project_id);
      readinessStatus = readiness.status;
      reasonCode = readiness.reasonCode;
      if (readiness.status === 'passed') {
        await this.deps.opctlService.setStartLock(
          parsed.project_id,
          false,
          'principal',
        );
        toState = await this.deps.opctlService.getProjectControlState(parsed.project_id);
      }
      evidenceRefs.push(...readiness.evidenceRefs);
    }

    const accepted = opctlResult.status === 'applied';
    const result = MaoProjectControlResultSchema.parse({
      command_id: parsed.command_id,
      project_id: parsed.project_id,
      accepted,
      status: opctlResult.status,
      from_state: fromState,
      to_state: accepted ? toState : fromState,
      reason_code: reasonCode,
      decision_ref: decisionRef,
      policy_ref: accepted ? `project-control:${parsed.action}` : undefined,
      impactSummary: impactSummary,
      evidenceRefs,
      readiness_status: readinessStatus,
    });

    const auditHistory = this.controlAuditByProject.get(parsed.project_id) ?? [];
    auditHistory.push({
      commandId: parsed.command_id,
      action: parsed.action,
      actorId: parsed.actor_id,
      reason: parsed.reason,
      reasonCode,
      at: nowIso(),
      evidenceRefs: result.evidenceRefs,
      resumeReadinessStatus: readinessStatus,
      decisionRef,
    });
    if (auditHistory.length > MaoProjectionService.MAX_AUDIT_HISTORY_PER_PROJECT) {
      auditHistory.splice(0, auditHistory.length - MaoProjectionService.MAX_AUDIT_HISTORY_PER_PROJECT);
    }
    this.controlAuditByProject.set(parsed.project_id, auditHistory);

    await this.emitProjectionEvent(
      accepted ? 'mao_project_control_applied' : 'mao_project_control_blocked',
      {
        projectId: parsed.project_id,
        action: parsed.action,
        commandId: parsed.command_id,
        toState: result.to_state,
        readinessStatus,
      },
    );
    if (parsed.action === 'resume_project' && accepted) {
      await this.emitProjectionEvent(
        readinessStatus === 'passed'
          ? 'mao_project_resume_readiness_passed'
          : 'mao_project_resume_readiness_blocked',
        {
          projectId: parsed.project_id,
          commandId: parsed.command_id,
          reasonCode,
        },
      );
    }

    this.deps.eventBus?.publish('mao:control-action', {
      projectId: parsed.project_id,
      action: parsed.action,
      result: accepted ? 'success' : 'failure',
    });

    return result;
  }

  async emitProjectionEvent(
    eventType: MaoEventType,
    detail: Record<string, unknown>,
  ): Promise<void> {
    if (this.deps.witnessService) {
      await this.deps.witnessService.appendAuthorization({
        actionCategory: 'mao-projection',
        actionRef: eventType,
        actor: 'system',
        status: 'approved',
        detail,
      });
    }
  }

  async getControlAuditHistory(projectId: ProjectId): Promise<MaoControlAuditHistoryEntry[]> {
    return (this.controlAuditByProject.get(projectId) ?? []).map((record) => ({
      commandId: record.commandId,
      action: record.action,
      actorId: record.actorId,
      reason: record.reason,
      reasonCode: record.reasonCode,
      at: record.at,
      evidenceRefs: record.evidenceRefs,
      resumeReadinessStatus: record.resumeReadinessStatus,
      decisionRef: record.decisionRef,
    }));
  }

  async getSystemSnapshot(input: MaoSystemSnapshotInput): Promise<MaoSystemSnapshot> {
    const parsed = MaoSystemSnapshotInputSchema.parse(input);
    const generatedAt = nowIso();

    if (!this.deps.projectStore) {
      return MaoSystemSnapshotSchema.parse({
        agents: [],
        leaseRoots: [],
        projectControls: {},
        densityMode: parsed.densityMode,
        generatedAt,
      });
    }

    const projects = await this.deps.projectStore.list();
    const allAgents: MaoAgentProjection[] = [];
    const leaseRoots: string[] = [];
    const projectControls: Record<string, MaoProjectControlProjection> = {};

    for (const project of projects) {
      const projectId = project.id;
      try {
        const context = await this.buildProjectionContext({
          projectId,
          densityMode: parsed.densityMode,
        });

        allAgents.push(...context.agentProjections);

        // Identify lease roots: agents that are not dispatched by another agent
        for (const agent of context.agentProjections) {
          if (agent.dispatching_task_agent_id == null) {
            leaseRoots.push(agent.agent_id);
          }
        }

        const controlProjection = this.buildProjectControlProjection(context);
        projectControls[projectId] = controlProjection;
      } catch {
        // Skip projects that fail to build context (e.g. no workflow engine state)
        continue;
      }
    }

    return MaoSystemSnapshotSchema.parse({
      agents: allAgents,
      leaseRoots,
      projectControls,
      densityMode: parsed.densityMode,
      generatedAt,
    });
  }

  private async buildProjectionContext(
    input: MaoProjectSnapshotInput,
  ): Promise<ProjectionContext> {
    const generatedAt = nowIso();
    const controlState = await this.deps.opctlService.getProjectControlState(
      input.projectId,
    );
    const runs = await this.deps.workflowEngine.listProjectRuns(input.projectId);
    const selectedRun = selectRun(runs, input.workflowRunId);
    const selectedGraph = selectedRun
      ? await this.deps.workflowEngine.getRunGraph(selectedRun.runId)
      : null;

    const agentProjections = selectedRun && selectedGraph
      ? Object.entries(selectedRun.nodeStates)
          .map(([nodeDefinitionId, nodeState]) =>
            this.buildAgentProjection(
              input.projectId,
              selectedRun,
              selectedGraph,
              nodeDefinitionId,
              nodeState,
              controlState,
            ))
      : [];

    const urgentAgentIds = agentProjections
      .filter((agent) => agent.urgency_level === 'urgent')
      .map((agent) => agent.agent_id);
    const blockedAgentIds = agentProjections
      .filter((agent) => ['blocked', 'waiting_pfc', 'failed'].includes(agent.state))
      .map((agent) => agent.agent_id);

    let voiceProjection: ProjectionContext['voiceProjection'];
    if (this.deps.voiceControlService) {
      try {
        const voice = await this.deps.voiceControlService.getSessionProjection({
          project_id: input.projectId,
        });
        voiceProjection = {
          current_turn_state: voice.current_turn_state,
          assistant_output_state: voice.assistant_output_state,
          degraded_mode: voice.degraded_mode,
          pending_confirmation: voice.pending_confirmation,
          continuation_required: voice.continuation_required,
          updated_at: voice.updated_at,
        };
      } catch {
        voiceProjection = undefined;
      }
    }

    return {
      projectId: input.projectId,
      densityMode: input.densityMode,
      generatedAt,
      controlState,
      runs,
      selectedRun,
      selectedGraph,
      agentProjections,
      runGraph: buildRunGraph(
        input.projectId,
        generatedAt,
        selectedRun,
        agentProjections,
        controlState,
        ),
      urgentAgentIds,
      blockedAgentIds,
      voiceProjection,
      degradedReasonCode:
        voiceProjection?.degraded_mode.reason ??
        (selectedRun != null && selectedGraph == null
          ? 'workflow_run_graph_unavailable'
          : undefined) ??
        (this.deps.healthAggregator?.getSystemStatus().bootStatus === 'degraded'
          ? 'system_health_degraded'
          : undefined),
    };
  }

  private buildAgentProjection(
    projectId: ProjectId,
    run: WorkflowRunState,
    graph: NonNullable<Awaited<ReturnType<IWorkflowEngine['getRunGraph']>>>,
    nodeDefinitionId: string,
    nodeState: WorkflowNodeRunState,
    controlState: ProjectControlState,
  ): MaoAgentProjection {
    const lifecycleState = mapLifecycleState(nodeState, controlState);
    const urgencyLevel = deriveUrgencyLevel(lifecycleState);
    const latestAttempt = nodeState.attempts[nodeState.attempts.length - 1];
    const parentNodeDefinitionId = run.dispatchLineage.find(
      (lineage) => lineage.id === nodeState.lastDispatchLineageId,
    )?.parentNodeDefinitionId;
    const dispatchingTaskAgentId =
      parentNodeDefinitionId != null
        ? run.nodeStates[parentNodeDefinitionId]?.id ?? null
        : null;
    const evidenceRefs = [
      ...new Set([
        ...(nodeState.evidenceRefs ?? []),
        ...(nodeState.activeWaitState?.evidenceRefs ?? []),
        ...(latestAttempt?.evidenceRefs ?? []),
      ]),
    ];
    const preview = buildReasoningPreview(projectId, run, nodeDefinitionId, nodeState);
    const nodeDefinition = graph.nodes[nodeDefinitionId]?.definition;
    const projection = {
      agent_id: nodeState.id,
      project_id: projectId,
      workflow_run_id: run.runId,
      workflow_node_definition_id: nodeDefinitionId as import('@nous/shared').WorkflowNodeDefinitionId,
      dispatching_task_agent_id: dispatchingTaskAgentId,
      dispatch_origin_ref: nodeState.lastDispatchLineageId ?? `workflow-run:${run.runId}`,
      agent_class: undefined,
      display_name: nodeDefinition?.metadata?.displayName ?? nodeDefinition?.name,
      state: lifecycleState,
      state_reason: nodeState.reasonCode ?? nodeState.activeWaitState?.reasonCode,
      state_reason_code:
        nodeState.reasonCode ?? nodeState.activeWaitState?.reasonCode,
      current_step:
        graph.nodes[nodeDefinitionId]?.definition.name ?? nodeDefinitionId,
      progress_percent: buildProgressPercent(
        nodeState,
        graph.topologicalOrder.length,
        run.completedNodeIds.length,
      ),
      risk_level: deriveRiskLevel(lifecycleState),
      urgency_level: urgencyLevel,
      attention_level: deriveAttentionLevel(urgencyLevel, lifecycleState),
      pfc_alert_status:
        lifecycleState === 'waiting_pfc' || lifecycleState === 'blocked'
          ? 'active'
          : lifecycleState === 'failed'
            ? 'critical'
            : 'none',
      pfc_mitigation_status:
        lifecycleState === 'waiting_pfc' || lifecycleState === 'blocked'
          ? 'awaiting_operator'
          : lifecycleState === 'resuming'
            ? 'resume_readiness_check'
            : 'none',
      dispatch_state: nodeState.status,
      reflection_cycle_count: nodeState.correctionArcs.length,
      last_correction_action:
        nodeState.correctionArcs[nodeState.correctionArcs.length - 1]?.type ??
        (lifecycleState === 'waiting_pfc' ? 'reflection_review' : undefined),
      last_correction_reason:
        nodeState.correctionArcs[nodeState.correctionArcs.length - 1]?.reasonCode ??
        nodeState.reasonCode,
      last_update_at: nodeState.updatedAt,
      reasoning_log_preview: preview,
      reasoning_log_last_entry_class: preview?.class ?? null,
      reasoning_log_last_entry_at: preview?.emittedAt ?? null,
      reasoning_log_redaction_state:
        preview?.redactionClass === 'restricted' ? 'restricted' : 'none',
      deepLinks: buildDeepLinks(
        projectId,
        run.runId,
        nodeDefinitionId,
        nodeState.lastDispatchLineageId,
        evidenceRefs[0],
      ),
      evidenceRefs,
      ...(() => {
        if (!this.deps.inferenceAdapter) return {};
        const agentClass = nodeDefinitionId;
        const inferenceState = this.deps.inferenceAdapter.getAgentInferenceState(agentClass);
        if (!inferenceState) return {};
        return {
          inference_provider_id: inferenceState.lastProviderId,
          inference_model_id: inferenceState.lastModelId,
          inference_latency_ms: inferenceState.lastLatencyMs,
          inference_total_tokens: inferenceState.totalTokens,
          inference_is_streaming: inferenceState.isStreaming,
        };
      })(),
    };

    return MaoAgentProjectionSchema.parse(projection);
  }

  private buildProjectControlProjection(
    context: ProjectionContext,
  ): MaoProjectControlProjection {
    const summary = buildSummary(context.agentProjections);
    const audit = this.controlAuditByProject.get(context.projectId)?.at(-1);
    const pfcReviewActive =
      context.controlState === 'paused_review' ||
      context.agentProjections.some((agent) => agent.state === 'waiting_pfc');
    return MaoProjectControlProjectionSchema.parse({
      project_id: context.projectId,
      project_control_state: context.controlState,
      active_agent_count: summary.activeAgentCount,
      blocked_agent_count: summary.blockedAgentCount,
      urgent_agent_count: summary.urgentAgentCount,
      project_last_control_action: audit?.action,
      project_last_control_actor: audit?.actorId,
      project_last_control_reason: audit?.reason,
      project_last_control_reason_code: audit?.reasonCode,
      project_last_control_at: audit?.at,
      resume_readiness_status:
        audit?.resumeReadinessStatus ?? 'not_applicable',
      resume_readiness_reason_code:
        audit?.resumeReadinessStatus &&
        audit.resumeReadinessStatus !== 'not_applicable'
          ? audit.reasonCode
          : undefined,
      resume_readiness_evidence_refs: audit?.evidenceRefs ?? [],
      pfc_project_review_status: pfcReviewActive
        ? 'active'
        : audit?.resumeReadinessStatus === 'passed'
          ? 'resolved'
          : 'none',
      pfc_project_recommendation:
        context.controlState === 'resuming'
          ? 'resume_with_constraints'
          : summary.failedAgentCount > 0 || summary.urgentAgentCount > 0
            ? 'hard_stop'
            : summary.blockedAgentCount > 0 || pfcReviewActive
              ? 'pause'
              : 'continue',
      voice_projection: context.voiceProjection,
    });
  }

  private async buildImpactSummary(projectId: ProjectId) {
    const runs = await this.deps.workflowEngine.listProjectRuns(projectId);
    const schedules = await this.deps.schedulerService.list(projectId);
    const escalationQueue = await this.deps.escalationService.listProjectQueue(projectId);
    const snapshot = await this.getProjectSnapshot({
      projectId,
      densityMode: 'D2',
    });

    return {
      activeRunCount: runs.filter((run) => ACTIVE_RUN_STATUSES.has(run.status)).length,
      activeAgentCount: snapshot.summary.activeAgentCount,
      blockedAgentCount: snapshot.summary.blockedAgentCount,
      urgentAgentCount:
        snapshot.summary.urgentAgentCount +
        escalationQueue.filter((item) =>
          ['high', 'critical'].includes(item.severity),
        ).length,
      affectedScheduleCount: schedules.filter((schedule) => schedule.enabled).length,
      evidenceRefs: [
        `workflow_runs=${runs.length}`,
        `enabled_schedules=${schedules.filter((schedule) => schedule.enabled).length}`,
        `open_escalations=${escalationQueue.length}`,
      ],
    };
  }

  private evaluateControlRequest(
    action: MaoProjectControlAction,
    controlState: ProjectControlState,
  ): string | null {
    if (action === 'resume_project' && controlState === 'running') {
      return 'control_state_running';
    }
    if (action === 'pause_project' && controlState === 'paused_review') {
      return 'control_state_paused_review';
    }
    if (action === 'hard_stop_project' && controlState === 'hard_stopped') {
      return 'control_state_hard_stopped';
    }
    if (action === 'pause_project' && controlState === 'hard_stopped') {
      return 'control_state_hard_stopped';
    }
    if (action === 'resume_project' && controlState === 'resuming') {
      return 'control_state_resuming';
    }
    return null;
  }

  private async evaluateResumeReadiness(projectId: ProjectId): Promise<{
    status: MaoProjectControlResult['readiness_status'];
    reasonCode: string;
    evidenceRefs: string[];
  }> {
    if (await this.deps.opctlService.hasStartLock(projectId)) {
      return {
        status: 'blocked',
        reasonCode: 'workflow_resume_denied_hard_stopped',
        evidenceRefs: ['project-control:hard_stopped'],
      };
    }

    const runs = await this.deps.workflowEngine.listProjectRuns(projectId);
    const blockedRun = runs.find((run) => run.status === 'blocked_review');
    if (blockedRun) {
      return {
        status: 'blocked',
        reasonCode: 'workflow_resume_readiness_blocked_review',
        evidenceRefs: [`workflow_run_id=${blockedRun.runId}`],
      };
    }

    return {
      status: 'passed',
      reasonCode: 'workflow_resume_readiness_passed',
      evidenceRefs: runs.length > 0 ? [`workflow_runs=${runs.length}`] : ['workflow_runs=0'],
    };
  }
}
