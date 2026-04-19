/**
 * Projects tRPC router.
 */
import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type {
  ArtifactVersionRecord,
  ExecutionTrace,
  InAppEscalationRecord,
  ProjectBlockedAction,
  ProjectConfig,
  ProjectConfigFieldProvenance,
  ProjectWorkflowSurfaceSnapshot,
  ProjectId,
  ProjectPackageDefaultSection,
  ScheduleDefinition,
  WorkflowDefinition,
  WorkflowEditorValidationIssue,
  WorkflowNodeInspectProjection,
  WorkflowNodeMonitorProjection,
  WorkflowNodeProjectionStatus,
  WorkflowRunState,
  WorkflowVisualDebugSnapshot,
} from '@nous/shared';
import {
  ExecutionTraceSchema,
  ProjectConfigurationSnapshotSchema,
  ProjectConfigSchema,
  ProjectConfigurationUpdateInputSchema,
  ProjectDashboardSnapshotSchema,
  ProjectIdSchema,
  ProjectWorkflowSurfaceSnapshotSchema,
  SaveWorkflowDefinitionInputSchema,
  ScheduleDefinitionSchema,
  ScheduleUpsertInputSchema,
  WorkflowDefinitionSchema,
  WorkflowDefinitionValidationResultSchema,
  WorkflowExecutionIdSchema,
  WorkflowNodeDefinitionIdSchema,
  WorkflowNodeInspectProjectionSchema,
  WorkflowVisualDebugSnapshotSchema,
} from '@nous/shared';
import {
  buildDerivedWorkflowGraph,
  parseWorkflowSpec,
  specToWorkflowDefinition,
  validateWorkflowDefinition as validateWorkflowDefinitionShape,
} from '@nous/subcortex-workflows';
import { router, publicProcedure } from '../trpc';

const TRACE_COLLECTION = 'execution_traces';

// Hardcoded defaults mirrored from the `create` handler below — used by
// `buildFieldProvenance` to distinguish `project_override` from `system_default`
// for fields that live directly on the stored document (no layered overrides
// representation). See SDS §Data Model user-override detection heuristic.
const SYSTEM_DEFAULT_PFC_TIER = 3;
const SYSTEM_DEFAULT_RETRIEVAL_BUDGET_TOKENS = 500;

function getProjectIdentity(project: ProjectConfig) {
  return {
    id: project.id,
    name: project.name,
    type: project.type,
  };
}

function getWorkflowDefinitions(project: ProjectConfig): WorkflowDefinition[] {
  return project.workflow?.definitions ?? [];
}

function getWorkflowBindings(
  project: ProjectConfig,
): NonNullable<ProjectConfig['workflow']>['packageBindings'] {
  return project.workflow?.packageBindings ?? [];
}

async function selectWorkflowDefinitionState(
  ctx: import('../../context').NousContext,
  project: ProjectConfig,
  preferredDefinitionId?: WorkflowDefinition['id'],
) {
  const definitions = getWorkflowDefinitions(project);
  const bindings = getWorkflowBindings(project);
  if (definitions.length === 0 && bindings.length === 0) {
    return {
      workflowDefinition: null,
      workflowDefinitionSource: null,
      degradedReasonCode: undefined,
    };
  }

  try {
    const workflowDefinition = await ctx.workflowEngine.resolveDefinition(
      project,
      preferredDefinitionId,
    );
    const workflowDefinitionSource = await ctx.workflowEngine.resolveDefinitionSource(
      project,
      preferredDefinitionId,
    );
    return {
      workflowDefinition,
      workflowDefinitionSource,
      degradedReasonCode: undefined,
    };
  } catch {
    return {
      workflowDefinition: null,
      workflowDefinitionSource: null,
      degradedReasonCode: 'workflow_definition_unavailable',
    };
  }
}

function activeRunStatus(run: WorkflowRunState): boolean {
  return ['ready', 'running', 'waiting', 'blocked_review', 'paused'].includes(
    run.status,
  );
}

function buildIssue(
  severity: WorkflowEditorValidationIssue['severity'],
  code: string,
  message: string,
  path: string[] = [],
): WorkflowEditorValidationIssue {
  return { severity, code, message, path };
}

function validateDraftDefinition(projectId: ProjectId, workflowDefinition: unknown) {
  const parsedDefinition = WorkflowDefinitionSchema.safeParse(workflowDefinition);
  if (!parsedDefinition.success) {
    return WorkflowDefinitionValidationResultSchema.parse({
      valid: false,
      definition: null,
      derivedGraph: null,
      issues: parsedDefinition.error.issues.map((issue) =>
        buildIssue(
          'error',
          'workflow_definition_schema_invalid',
          issue.message,
          issue.path.map((segment) => String(segment)),
        )),
    });
  }

  const definition = parsedDefinition.data;
  const issues: WorkflowEditorValidationIssue[] = [];
  if (definition.projectId !== projectId) {
    issues.push(
      buildIssue(
        'error',
        'workflow_definition_project_mismatch',
        `Workflow definition projectId (${definition.projectId}) must match the selected project (${projectId})`,
        ['projectId'],
      ),
    );
  }

  const validation = validateWorkflowDefinitionShape(definition);
  if (!validation.valid) {
    issues.push(
      ...validation.issues.map((issue) =>
        buildIssue('error', issue.code, issue.message)),
    );
  }

  if (issues.length > 0) {
    return WorkflowDefinitionValidationResultSchema.parse({
      valid: false,
      definition,
      derivedGraph: null,
      issues,
    });
  }

  return WorkflowDefinitionValidationResultSchema.parse({
    valid: true,
    definition,
    derivedGraph: buildDerivedWorkflowGraph(definition),
    issues: [],
  });
}

export async function getProjectOrThrow(
  ctx: import('../../context').NousContext,
  projectId: ProjectId,
) {
  const project = await ctx.projectStore.get(projectId);
  if (!project) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `Project ${projectId} not found`,
    });
  }
  return project;
}

async function listProjectTraces(
  ctx: import('../../context').NousContext,
  projectId: ProjectId,
  limit = 10,
): Promise<ExecutionTrace[]> {
  const raw = await ctx.documentStore.query<Record<string, unknown>>(TRACE_COLLECTION, {
    where: { projectId },
    orderBy: 'startedAt',
    orderDirection: 'desc',
    limit,
  });

  return raw
    .map((item) => ExecutionTraceSchema.safeParse(item))
    .filter((result): result is { success: true; data: ExecutionTrace } => result.success)
    .map((result) => result.data);
}

function deriveNodeStatus(
  nodeState: WorkflowRunState['nodeStates'][string] | null,
  runtimeAvailability: 'live' | 'no_active_run' | 'degraded_runtime_unavailable',
): WorkflowNodeProjectionStatus {
  if (runtimeAvailability === 'degraded_runtime_unavailable') {
    return 'degraded';
  }
  return nodeState?.status ?? 'pending';
}

function buildNodeDeepLinks(input: {
  projectId: ProjectId;
  runId?: WorkflowRunState['runId'];
  nodeDefinitionId: WorkflowDefinition['nodes'][number]['id'];
  dispatchLineageId?: string;
  artifactRefs: string[];
  evidenceRef?: string;
}) {
  return [
    {
      target: 'chat' as const,
      projectId: input.projectId,
      workflowRunId: input.runId,
      nodeDefinitionId: input.nodeDefinitionId,
      dispatchLineageId: input.dispatchLineageId as any,
      evidenceRef: input.evidenceRef,
    },
    {
      target: 'traces' as const,
      projectId: input.projectId,
      workflowRunId: input.runId,
      nodeDefinitionId: input.nodeDefinitionId,
      dispatchLineageId: input.dispatchLineageId as any,
      evidenceRef: input.evidenceRef,
    },
    {
      target: 'mao' as const,
      projectId: input.projectId,
      workflowRunId: input.runId,
      nodeDefinitionId: input.nodeDefinitionId,
      dispatchLineageId: input.dispatchLineageId as any,
      evidenceRef: input.evidenceRef,
    },
    {
      target: 'mobile' as const,
      projectId: input.projectId,
      workflowRunId: input.runId,
      nodeDefinitionId: input.nodeDefinitionId,
      dispatchLineageId: input.dispatchLineageId as any,
      evidenceRef: input.evidenceRef,
    },
    ...input.artifactRefs.map((artifactRef) => ({
      target: 'artifact' as const,
      projectId: input.projectId,
      workflowRunId: input.runId,
      nodeDefinitionId: input.nodeDefinitionId,
      artifactRef,
      dispatchLineageId: input.dispatchLineageId as any,
      evidenceRef: input.evidenceRef,
    })),
  ];
}

function buildNodeProjections(input: {
  graph: NonNullable<ProjectWorkflowSurfaceSnapshot['graph']>;
  projectId: ProjectId;
  selectedRun: WorkflowRunState | null;
  runtimeAvailability: 'live' | 'no_active_run' | 'degraded_runtime_unavailable';
  recentArtifacts: ArtifactVersionRecord[];
}): WorkflowNodeMonitorProjection[] {
  return input.graph.topologicalOrder.map((nodeDefinitionId: WorkflowDefinition['nodes'][number]['id']) => {
    const definition = input.graph.nodes[nodeDefinitionId]!.definition;
    const nodeState = input.selectedRun?.nodeStates[nodeDefinitionId] ?? null;
    const artifactRefs = input.recentArtifacts
      .filter((record) => record.lineage?.workflowNodeDefinitionId === nodeDefinitionId)
      .map((record) => record.artifactRef);
    const evidenceRef =
      nodeState?.evidenceRefs[0] ??
      nodeState?.attempts[nodeState.attempts.length - 1]?.evidenceRefs[0];

    return {
      nodeDefinitionId,
      definition,
      nodeState,
      status: deriveNodeStatus(nodeState, input.runtimeAvailability),
      groupKey: `status:${deriveNodeStatus(nodeState, input.runtimeAvailability)}`,
      artifactRefs,
      traceIds: [],
      deepLinks: buildNodeDeepLinks({
        projectId: input.projectId,
        runId: input.selectedRun?.runId,
        nodeDefinitionId,
        dispatchLineageId: nodeState?.lastDispatchLineageId,
        artifactRefs,
        evidenceRef,
      }),
    } satisfies WorkflowNodeMonitorProjection;
  });
}

function buildCheckpointSummary(runState: WorkflowRunState | null) {
  return {
    runCheckpointState: runState?.checkpointState ?? 'idle',
    lastPreparedCheckpointId: runState?.lastPreparedCheckpointId,
    lastCommittedCheckpointId: runState?.lastCommittedCheckpointId,
  };
}

function buildSchedulerDebugSummary(
  schedules: ScheduleDefinition[],
  runState: WorkflowRunState | null,
) {
  const now = Date.now();
  const enabledSchedules = schedules.filter((schedule) => schedule.enabled);
  return {
    triggerContext: runState?.triggerContext ?? null,
    enabledScheduleCount: enabledSchedules.length,
    overdueScheduleCount: enabledSchedules.filter(
      (schedule) =>
        schedule.nextDueAt != null && Date.parse(schedule.nextDueAt) <= now,
    ).length,
    evidenceRefs: enabledSchedules.map((schedule) => `schedule:${schedule.id}`),
  };
}

function deriveStageKind(input: {
  isEntry: boolean;
  hasOutbound: boolean;
  definitions: WorkflowDefinition['nodes'];
}) {
  if (input.isEntry) {
    return 'entry' as const;
  }
  if (!input.hasOutbound) {
    return 'terminal' as const;
  }
  if (input.definitions.some((definition) => definition.type === 'condition')) {
    return 'decision' as const;
  }
  if (
    input.definitions.some((definition) =>
      ['quality-gate', 'human-decision'].includes(definition.type),
    )
  ) {
    return 'review' as const;
  }
  return 'execution' as const;
}

function deriveStageProjections(
  graph: NonNullable<ProjectWorkflowSurfaceSnapshot['graph']>,
) {
  const stageByNode = new Map<WorkflowDefinition['nodes'][number]['id'], number>();
  for (const nodeId of graph.topologicalOrder) {
    const inboundStageIndexes = graph.nodes[nodeId]!.inboundEdgeIds
      .map((edgeId: WorkflowDefinition['edges'][number]['id']) => graph.edges[edgeId]!)
      .map((edge: WorkflowDefinition['edges'][number]) => stageByNode.get(edge.from) ?? 0);
    const index =
      inboundStageIndexes.length > 0 ? Math.max(...inboundStageIndexes) + 1 : 0;
    stageByNode.set(nodeId, index);
  }

  const grouped = new Map<number, WorkflowDefinition['nodes']>();
  for (const nodeId of graph.topologicalOrder) {
    const stageIndex = stageByNode.get(nodeId) ?? 0;
    const definition = graph.nodes[nodeId]!.definition;
    grouped.set(stageIndex, [...(grouped.get(stageIndex) ?? []), definition]);
  }

  const stages = [...grouped.entries()]
    .sort(([left], [right]) => left - right)
    .map(([index, definitions]) => {
      const stageId = `stage-${index}`;
      const isEntry = definitions.some((definition) =>
        graph.entryNodeIds.includes(definition.id),
      );
      const hasOutbound = definitions.some(
        (definition) => graph.nodes[definition.id]!.outboundEdgeIds.length > 0,
      );
      const kind = deriveStageKind({ isEntry, hasOutbound, definitions });
      return {
        id: stageId,
        index,
        label:
          kind === 'entry'
            ? 'Entry'
            : kind === 'terminal'
              ? 'Terminal'
              : `${kind[0]!.toUpperCase()}${kind.slice(1)} ${index + 1}`,
        nodeDefinitionIds: definitions.map((definition) => definition.id),
        kind,
      };
    });

  return { stages, stageByNode };
}

function deriveCanvasEdgeState(
  edge: WorkflowDefinition['edges'][number],
  runState: WorkflowRunState | null,
) {
  if (!runState) {
    return {
      state: 'inactive' as const,
      reasonCode: undefined,
    };
  }

  if (runState.activatedEdgeIds.includes(edge.id)) {
    return {
      state: 'activated' as const,
      reasonCode: undefined,
    };
  }

  const sourceState = runState.nodeStates[edge.from];
  if (
    edge.branchKey &&
    sourceState?.selectedBranchKey &&
    sourceState.selectedBranchKey !== edge.branchKey
  ) {
    return {
      state: 'blocked_path' as const,
      reasonCode: sourceState.reasonCode ?? 'workflow_branch_not_selected',
    };
  }

  if (
    sourceState &&
    ['running', 'waiting', 'blocked', 'completed', 'failed'].includes(
      sourceState.status,
    )
  ) {
    return {
      state: 'candidate' as const,
      reasonCode: sourceState.reasonCode,
    };
  }

  return {
    state: 'inactive' as const,
    reasonCode: sourceState?.reasonCode,
  };
}

function deriveGraphProjectionParity(input: {
  selectedRun: WorkflowRunState | null;
  maoRunGraph: Awaited<ReturnType<import('../../context').NousContext['maoProjectionService']['getRunGraphSnapshot']>> | null;
  graph: ProjectWorkflowSurfaceSnapshot['graph'];
}) {
  if (!input.selectedRun) {
    return 'aligned' as const;
  }
  if (!input.graph || !input.maoRunGraph) {
    return 'degraded' as const;
  }

  const workflowNodeCount = Object.keys(input.selectedRun.nodeStates).length;
  const maoNodeCount = input.maoRunGraph.nodes.filter((node) => node.kind === 'agent').length;
  return workflowNodeCount === maoNodeCount ? 'aligned' : 'degraded';
}

async function buildWorkflowSnapshot(
  ctx: import('../../context').NousContext,
  project: ProjectConfig,
  runId?: WorkflowRunState['runId'],
): Promise<ProjectWorkflowSurfaceSnapshot> {
  const recentRuns = await ctx.workflowEngine.listProjectRuns(project.id);
  const selectedRun =
    (runId
      ? recentRuns.find((run) => run.runId === runId)
      : recentRuns.find(activeRunStatus) ?? recentRuns[0]) ?? null;
  const selectedRunGraph = selectedRun
    ? await ctx.workflowEngine.getRunGraph(selectedRun.runId)
    : null;
  const workflowSelection = await selectWorkflowDefinitionState(
    ctx,
    project,
    selectedRun?.workflowDefinitionId,
  );
  const workflowDefinition = workflowSelection.workflowDefinition;

  let fallbackGraph = null;
  let degradedReasonCode: string | undefined = workflowSelection.degradedReasonCode;
  if (workflowDefinition) {
    try {
      fallbackGraph = buildDerivedWorkflowGraph(workflowDefinition);
    } catch {
      degradedReasonCode = 'workflow_definition_invalid';
    }
  }

  const runtimeAvailability =
    selectedRun && selectedRunGraph
      ? 'live'
      : selectedRun && !selectedRunGraph
        ? 'degraded_runtime_unavailable'
        : degradedReasonCode
          ? 'degraded_runtime_unavailable'
          : 'no_active_run';

  const graph = selectedRunGraph ?? fallbackGraph;
  const recentArtifacts = await ctx.artifactStore.list(
    project.id,
    selectedRun
      ? { workflowRunId: selectedRun.runId, includeAllVersions: false, limit: 20 }
      : { includeAllVersions: false, limit: 20 },
  );
  const recentTraces = await listProjectTraces(ctx, project.id, 10);
  const controlProjection = await ctx.maoProjectionService.getProjectControlProjection(
    project.id,
  );

  const nodeProjections = graph
    ? buildNodeProjections({
        graph,
        projectId: project.id,
        selectedRun,
        runtimeAvailability,
        recentArtifacts,
      })
    : [];

  return ProjectWorkflowSurfaceSnapshotSchema.parse({
    project: getProjectIdentity(project),
    workflowDefinition,
    workflowDefinitionSource: workflowSelection.workflowDefinitionSource,
    graph,
    runtimeAvailability,
    selectedRunId: selectedRun?.runId,
    activeRunState: selectedRun,
    recentRuns,
    nodeProjections,
    recentArtifacts,
    recentTraces: recentTraces.map((trace) => ({
      traceId: trace.traceId,
      startedAt: trace.startedAt,
      completedAt: trace.completedAt,
      turnCount: trace.turns.length,
    })),
    controlProjection,
    diagnostics: {
      runtimePosture: 'single_process_local',
      degradedReasonCode,
      inspectFirstMode: workflowDefinition ? project.type : 'no-definition',
    },
  });
}

async function buildWorkflowVisualDebugSnapshot(
  ctx: import('../../context').NousContext,
  project: ProjectConfig,
  runId?: WorkflowRunState['runId'],
): Promise<WorkflowVisualDebugSnapshot> {
  const snapshot = await buildWorkflowSnapshot(ctx, project, runId);
  const schedules = await ctx.schedulerService.list(project.id);
  const maoRunGraph = snapshot.selectedRunId
    ? await ctx.maoProjectionService.getRunGraphSnapshot({
        projectId: project.id,
        densityMode: 'D2',
        workflowRunId: snapshot.selectedRunId,
      })
    : null;

  const { stages, stageByNode } = snapshot.graph
    ? deriveStageProjections(snapshot.graph)
    : { stages: [], stageByNode: new Map<WorkflowDefinition['nodes'][number]['id'], number>() };

  const rowByNode = new Map<WorkflowDefinition['nodes'][number]['id'], number>();
  for (const stage of stages) {
    stage.nodeDefinitionIds.forEach((nodeDefinitionId, index) => {
      rowByNode.set(nodeDefinitionId, index);
    });
  }

  const canvasNodes = snapshot.nodeProjections.map((projection: WorkflowNodeMonitorProjection) => {
    const stageIndex = stageByNode.get(projection.nodeDefinitionId) ?? 0;
    return {
      nodeDefinitionId: projection.nodeDefinitionId,
      definition: projection.definition,
      stageId: `stage-${stageIndex}`,
      column: stageIndex,
      row: rowByNode.get(projection.nodeDefinitionId) ?? 0,
      status: projection.status,
      isEntry: snapshot.graph?.entryNodeIds.includes(projection.nodeDefinitionId) ?? false,
      isActive:
        snapshot.activeRunState?.activeNodeIds.includes(projection.nodeDefinitionId) ?? false,
      latestAttemptStatus:
        projection.nodeState?.attempts[projection.nodeState.attempts.length - 1]?.status ??
        projection.nodeState?.status,
      latestReasonCode:
        projection.nodeState?.reasonCode ??
        projection.nodeState?.attempts[projection.nodeState.attempts.length - 1]?.reasonCode,
      artifactCount: projection.artifactRefs.length,
      traceCount: projection.traceIds.length,
      deepLinks: projection.deepLinks,
    };
  });

  const canvasEdges = snapshot.workflowDefinition?.edges.map((edge: WorkflowDefinition['edges'][number]) => {
    const state = deriveCanvasEdgeState(edge, snapshot.activeRunState);
    return {
      edge,
      state: state.state,
      isBranchEdge: edge.branchKey != null,
      branchKey: edge.branchKey,
      reasonCode: state.reasonCode,
    };
  }) ?? [];

  const graphProjectionParity = deriveGraphProjectionParity({
    selectedRun: snapshot.activeRunState,
    maoRunGraph,
    graph: snapshot.graph,
  });

  return WorkflowVisualDebugSnapshotSchema.parse({
    ...snapshot,
    stages,
    canvasNodes,
    canvasEdges,
    maoRunGraph,
    checkpointSummary: buildCheckpointSummary(snapshot.activeRunState),
    schedulerSummary: buildSchedulerDebugSummary(schedules, snapshot.activeRunState),
    diagnostics: {
      ...snapshot.diagnostics,
      graphProjectionParity,
    },
  });
}

async function buildNodeInspectProjection(
  ctx: import('../../context').NousContext,
  project: ProjectConfig,
  input: {
    nodeDefinitionId: WorkflowDefinition['nodes'][number]['id'];
    runId?: WorkflowRunState['runId'];
  },
): Promise<WorkflowNodeInspectProjection> {
  const snapshot = await buildWorkflowSnapshot(ctx, project, input.runId);
  const monitor = snapshot.nodeProjections.find(
    (projection: WorkflowNodeMonitorProjection) => projection.nodeDefinitionId === input.nodeDefinitionId,
  );
  if (!monitor) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `Workflow node ${input.nodeDefinitionId} not found in the selected workflow snapshot`,
    });
  }

  const maoInspect = await ctx.maoProjectionService.getAgentInspectProjection({
    projectId: project.id,
    workflowRunId: snapshot.selectedRunId,
    nodeDefinitionId: input.nodeDefinitionId as any,
  });

  const nodeArtifacts = snapshot.recentArtifacts
    .filter((artifact: ArtifactVersionRecord) => artifact.lineage?.workflowNodeDefinitionId === input.nodeDefinitionId)
    .map((artifact: ArtifactVersionRecord) => artifact.artifactRef);

  return WorkflowNodeInspectProjectionSchema.parse({
    nodeDefinitionId: input.nodeDefinitionId,
    monitor,
    maoInspect,
    checkpointSummary: buildCheckpointSummary(snapshot.activeRunState),
    artifactRefs: nodeArtifacts,
    traceIds: monitor.traceIds,
    policyReasonCode:
      maoInspect?.latestAttempt?.reasonCode ??
      monitor.nodeState?.latestGovernanceDecision?.reasonCode ??
      monitor.nodeState?.reasonCode,
  });
}

async function getProjectControlState(
  ctx: import('../../context').NousContext,
  projectId: ProjectId,
) {
  return ctx.opctlService.getProjectControlState(projectId);
}

function deriveBlockedActions(
  controlState: Awaited<ReturnType<typeof getProjectControlState>>,
): ProjectBlockedAction[] {
  switch (controlState) {
    case 'hard_stopped':
      return [
        {
          action: 'edit_project_configuration',
          allowed: false,
          reasonCode: 'control_state_hard_stopped',
          message: 'Project configuration is read-only while the project is hard stopped.',
          evidenceRefs: ['project-control:hard_stopped'],
        },
        {
          action: 'update_schedule',
          allowed: false,
          reasonCode: 'control_state_hard_stopped',
          message: 'Schedules cannot be changed while the project is hard stopped.',
          evidenceRefs: ['project-control:hard_stopped'],
        },
        {
          action: 'acknowledge_escalation',
          allowed: true,
          message: 'Escalations may still be acknowledged while the project is hard stopped.',
          evidenceRefs: ['project-control:hard_stopped'],
        },
        {
          action: 'resume_project',
          allowed: false,
          reasonCode: 'control_state_hard_stopped',
          message: 'Resume remains blocked until the hard stop is cleared through operator control.',
          evidenceRefs: ['project-control:hard_stopped'],
        },
        {
          action: 'pause_project',
          allowed: false,
          reasonCode: 'control_state_hard_stopped',
          message: 'The project is already hard stopped.',
          evidenceRefs: ['project-control:hard_stopped'],
        },
        {
          action: 'hard_stop_project',
          allowed: false,
          reasonCode: 'control_state_hard_stopped',
          message: 'The project is already hard stopped.',
          evidenceRefs: ['project-control:hard_stopped'],
        },
        {
          action: 'archive_project',
          allowed: false,
          reasonCode: 'control_state_hard_stopped',
          message: 'Archive is blocked while the project is hard stopped.',
          evidenceRefs: ['project-control:hard_stopped'],
        },
      ];
    case 'paused_review':
      return [
        {
          action: 'edit_project_configuration',
          allowed: false,
          reasonCode: 'control_state_paused_review',
          message: 'Configuration edits are blocked while the project is paused for review.',
          evidenceRefs: ['project-control:paused_review'],
        },
        {
          action: 'update_schedule',
          allowed: false,
          reasonCode: 'control_state_paused_review',
          message: 'Schedule updates are blocked while the project is paused for review.',
          evidenceRefs: ['project-control:paused_review'],
        },
        {
          action: 'acknowledge_escalation',
          allowed: true,
          message: 'Escalations may be acknowledged while the project is paused for review.',
          evidenceRefs: ['project-control:paused_review'],
        },
        {
          action: 'resume_project',
          allowed: true,
          message: 'The project can be resumed once the review gate is cleared.',
          evidenceRefs: ['project-control:paused_review'],
        },
        {
          action: 'pause_project',
          allowed: false,
          reasonCode: 'control_state_paused_review',
          message: 'The project is already paused for review.',
          evidenceRefs: ['project-control:paused_review'],
        },
        {
          action: 'hard_stop_project',
          allowed: true,
          message: 'Hard stop remains available while paused for review.',
          evidenceRefs: ['project-control:paused_review'],
        },
        {
          action: 'archive_project',
          allowed: true,
          message: 'Archive is allowed while the project is paused for review.',
          evidenceRefs: ['project-control:paused_review'],
        },
      ];
    case 'resuming':
      return [
        {
          action: 'edit_project_configuration',
          allowed: false,
          reasonCode: 'control_state_resuming',
          message: 'Configuration edits are blocked while the project is resuming.',
          evidenceRefs: ['project-control:resuming'],
        },
        {
          action: 'update_schedule',
          allowed: false,
          reasonCode: 'control_state_resuming',
          message: 'Schedule updates are blocked while the project is resuming.',
          evidenceRefs: ['project-control:resuming'],
        },
        {
          action: 'acknowledge_escalation',
          allowed: true,
          message: 'Escalations may be acknowledged while the project is resuming.',
          evidenceRefs: ['project-control:resuming'],
        },
        {
          action: 'resume_project',
          allowed: false,
          reasonCode: 'control_state_resuming',
          message: 'The project is already resuming.',
          evidenceRefs: ['project-control:resuming'],
        },
        {
          action: 'pause_project',
          allowed: false,
          reasonCode: 'control_state_resuming',
          message: 'Pause is temporarily blocked while resume work is in progress.',
          evidenceRefs: ['project-control:resuming'],
        },
        {
          action: 'hard_stop_project',
          allowed: true,
          message: 'Hard stop remains available while the project is resuming.',
          evidenceRefs: ['project-control:resuming'],
        },
        {
          action: 'archive_project',
          allowed: false,
          reasonCode: 'control_state_resuming',
          message: 'Archive is blocked while resume work is in progress.',
          evidenceRefs: ['project-control:resuming'],
        },
      ];
    case 'running':
    default:
      return [
        {
          action: 'edit_project_configuration',
          allowed: true,
          message: 'Configuration edits are allowed while the project is running.',
          evidenceRefs: ['project-control:running'],
        },
        {
          action: 'update_schedule',
          allowed: true,
          message: 'Schedule updates are allowed while the project is running.',
          evidenceRefs: ['project-control:running'],
        },
        {
          action: 'acknowledge_escalation',
          allowed: true,
          message: 'Escalations may be acknowledged while the project is running.',
          evidenceRefs: ['project-control:running'],
        },
        {
          action: 'resume_project',
          allowed: false,
          reasonCode: 'control_state_running',
          message: 'The project is already running.',
          evidenceRefs: ['project-control:running'],
        },
        {
          action: 'pause_project',
          allowed: true,
          message: 'Pause remains available while the project is running.',
          evidenceRefs: ['project-control:running'],
        },
        {
          action: 'hard_stop_project',
          allowed: true,
          message: 'Hard stop remains available while the project is running.',
          evidenceRefs: ['project-control:running'],
        },
        {
          action: 'archive_project',
          allowed: true,
          message: 'Archive is allowed while the project is running.',
          evidenceRefs: ['project-control:running'],
        },
      ];
  }
}

function buildFieldProvenance(
  project: ProjectConfig,
  blockedActions: ProjectBlockedAction[],
): ProjectConfigFieldProvenance[] {
  const lockedConfig = !blockedActions.find(
    (action) => action.action === 'edit_project_configuration',
  )?.allowed;
  const lockedSchedule = !blockedActions.find(
    (action) => action.action === 'update_schedule',
  )?.allowed;
  const packageSections = new Set<ProjectPackageDefaultSection>(
    project.packageDefaultIntake.flatMap((entry) => entry.appliedSections),
  );

  const packageEvidence = project.packageDefaultIntake.map(
    (entry) => `package-default:${entry.sourcePackageId}:${entry.sourcePackageVersion}`,
  );

  // Package-vs-system classifier for fields with a package-default pairing.
  // A field is `package_default` if its canonical section has been applied
  // via `packageDefaultIntake`, else `system_default` (the hardcoded defaults
  // baked into the `create` handler / schema `.default(...)` clauses).
  const packageOrSystem = (
    section: ProjectPackageDefaultSection,
  ): 'package_default' | 'system_default' =>
    packageSections.has(section) ? 'package_default' : 'system_default';
  const sectionEvidence = (fallback: string): string[] =>
    packageEvidence.length > 0 ? packageEvidence : [fallback];

  const provenance: ProjectConfigFieldProvenance[] = [
    {
      field: 'type',
      source: packageOrSystem('project_type'),
      evidenceRefs: sectionEvidence('project-config:type'),
      lockedByPolicy: lockedConfig,
    },
    {
      field: 'pfcTier',
      // V1 user-override heuristic: value != hardcoded default -> user
      // override. `pfcTier: 3` emits `system_default` (decision §5 new-fields
      // subsection is explicit on this). See Known Issues in CR.
      source:
        project.pfcTier === SYSTEM_DEFAULT_PFC_TIER
          ? 'system_default'
          : 'project_override',
      evidenceRefs: ['project-config:pfcTier'],
      lockedByPolicy: lockedConfig,
    },
    {
      field: 'governanceDefaults',
      source: packageOrSystem('governance_defaults'),
      evidenceRefs: sectionEvidence('project-config:governanceDefaults'),
      lockedByPolicy: lockedConfig,
    },
    {
      field: 'modelAssignments',
      source: packageOrSystem('model_assignments'),
      evidenceRefs: sectionEvidence('project-config:modelAssignments'),
      lockedByPolicy: lockedConfig,
    },
    {
      field: 'memoryAccessPolicy',
      source: packageOrSystem('memory_access_policy'),
      evidenceRefs: sectionEvidence('project-config:memoryAccessPolicy'),
      lockedByPolicy: lockedConfig,
    },
    {
      field: 'retrievalBudgetTokens',
      source:
        project.retrievalBudgetTokens === SYSTEM_DEFAULT_RETRIEVAL_BUDGET_TOKENS
          ? 'system_default'
          : 'project_override',
      evidenceRefs: ['project-config:retrievalBudgetTokens'],
      lockedByPolicy: lockedConfig,
    },
    {
      field: 'escalationPreferences',
      source: packageOrSystem('escalation_preferences'),
      evidenceRefs: sectionEvidence('project-config:escalationPreferences'),
      lockedByPolicy: lockedConfig,
    },
    {
      field: 'escalationChannels',
      // `escalationChannels` has no package-default section pairing and no
      // single hardcoded default (defaults come from `ctx.config.defaults`
      // at create time). V1 posture: always emit `system_default` here;
      // downstream UX (1.4) decides how to present "user set" semantics.
      source: 'system_default',
      evidenceRefs: ['project-config:escalationChannels'],
      lockedByPolicy: lockedConfig,
    },
    {
      field: 'budgetPolicy',
      // Non-null stored budgetPolicy => user override; null/undefined =>
      // system_default meaning "no budget enforced" (null value semantics).
      source: project.budgetPolicy ? 'project_override' : 'system_default',
      evidenceRefs: ['project-config:budgetPolicy'],
      lockedByPolicy: lockedConfig,
    },
    {
      field: 'name',
      // `name` is required on `ProjectConfig` — always present. Emit
      // `project_override` when set; never unset on a valid config.
      source: 'project_override',
      evidenceRefs: ['project-config:name'],
      lockedByPolicy: lockedConfig,
    },
    {
      field: 'schedules',
      source: packageSections.has('schedule_settings')
        ? 'package_default'
        : 'derived_read_only',
      evidenceRefs: packageSections.has('schedule_settings')
        ? packageEvidence
        : ['project-schedules'],
      lockedByPolicy: lockedSchedule,
    },
    {
      field: 'packageDefaultIntake',
      source: 'derived_read_only',
      evidenceRefs: ['package-default-intake'],
      lockedByPolicy: false,
    },
    {
      field: 'createdAt',
      source: 'derived_read_only',
      evidenceRefs: ['project-config:createdAt'],
      lockedByPolicy: false,
    },
    {
      field: 'updatedAt',
      source: 'derived_read_only',
      evidenceRefs: ['project-config:updatedAt'],
      lockedByPolicy: false,
    },
  ];

  // Optional identity fields — description, icon, iconColor — follow the
  // ratified decision §5 new-fields mapping. `description`/`icon` are
  // omitted from provenance when unset. `iconColor` unset emits
  // `derived_read_only` with evidence note `avatarColorFromId`.
  if (project.description !== undefined) {
    provenance.push({
      field: 'description',
      source: 'project_override',
      evidenceRefs: ['project-config:description'],
      lockedByPolicy: lockedConfig,
    });
  }
  if (project.icon !== undefined) {
    provenance.push({
      field: 'icon',
      source: 'project_override',
      evidenceRefs: ['project-config:icon'],
      lockedByPolicy: lockedConfig,
    });
  }
  provenance.push(
    project.iconColor !== undefined
      ? {
          field: 'iconColor',
          source: 'project_override',
          evidenceRefs: ['project-config:iconColor'],
          lockedByPolicy: lockedConfig,
        }
      : {
          field: 'iconColor',
          source: 'derived_read_only',
          evidenceRefs: ['derived:avatarColorFromId'],
          lockedByPolicy: lockedConfig,
        },
  );

  return provenance;
}

function deriveHealthSummary(
  workflowSnapshot: Awaited<ReturnType<typeof buildWorkflowSnapshot>>,
  schedules: ScheduleDefinition[],
  escalations: InAppEscalationRecord[],
  controlState: Awaited<ReturnType<typeof getProjectControlState>>,
  taskSummary?: { enabledTaskCount: number; recentTaskFailureCount: number },
) {
  const now = Date.now();
  const blockedNodeCount = workflowSnapshot.activeRunState?.blockedNodeIds.length ?? 0;
  const waitingNodeCount = workflowSnapshot.activeRunState?.waitingNodeIds.length ?? 0;
  const enabledScheduleCount = schedules.filter((schedule) => schedule.enabled).length;
  const overdueScheduleCount = schedules.filter(
    (schedule) =>
      schedule.enabled &&
      schedule.nextDueAt != null &&
      Date.parse(schedule.nextDueAt) <= now,
  ).length;
  const openEscalationCount = escalations.filter((item) =>
    ['queued', 'visible', 'delivery_degraded'].includes(item.status),
  ).length;
  const urgentEscalationCount = escalations.filter((item) =>
    ['high', 'critical'].includes(item.severity),
  ).length;
  const enabledTaskCount = taskSummary?.enabledTaskCount ?? 0;
  const recentTaskFailureCount = taskSummary?.recentTaskFailureCount ?? 0;

  let overallStatus: 'healthy' | 'attention_required' | 'blocked' | 'degraded' = 'healthy';
  if (
    workflowSnapshot.runtimeAvailability === 'degraded_runtime_unavailable' ||
    escalations.some((item) => item.status === 'delivery_degraded')
  ) {
    overallStatus = 'degraded';
  } else if (
    controlState !== 'running' ||
    blockedNodeCount > 0 ||
    workflowSnapshot.activeRunState?.status === 'blocked_review'
  ) {
    overallStatus = 'blocked';
  } else if (
    waitingNodeCount > 0 ||
    overdueScheduleCount > 0 ||
    openEscalationCount > 0
  ) {
    overallStatus = 'attention_required';
  }

  // Task failure escalation: if recent task failures and not already worse
  if (recentTaskFailureCount > 0 && overallStatus === 'healthy') {
    overallStatus = 'attention_required';
  }

  return {
    overallStatus,
    runtimeAvailability: workflowSnapshot.runtimeAvailability,
    activeRunStatus: workflowSnapshot.activeRunState?.status,
    blockedNodeCount,
    waitingNodeCount,
    enabledScheduleCount,
    overdueScheduleCount,
    openEscalationCount,
    urgentEscalationCount,
    enabledTaskCount,
    recentTaskFailureCount,
  } as const;
}

async function buildConfigurationSnapshot(
  ctx: import('../../context').NousContext,
  project: ProjectConfig,
) {
  const controlState = await getProjectControlState(ctx, project.id);
  const schedules = await ctx.schedulerService.list(project.id);
  const blockedActions = deriveBlockedActions(controlState);
  return ProjectConfigurationSnapshotSchema.parse({
    projectId: project.id,
    updatedAt: project.updatedAt,
    config: project,
    schedules,
    blockedActions,
    fieldProvenance: buildFieldProvenance(project, blockedActions),
  });
}

export async function buildProjectDashboardSnapshot(
  ctx: import('../../context').NousContext,
  project: ProjectConfig,
) {
  const workflowSnapshot = await buildWorkflowSnapshot(ctx, project);
  const schedules = await ctx.schedulerService.list(project.id);
  const openEscalations = await ctx.escalationService.listProjectQueue(project.id);
  const controlState = await getProjectControlState(ctx, project.id);
  const blockedActions = deriveBlockedActions(controlState);

  // Build task summary
  const tasks = await ctx.taskStore.listByProject(project.id);
  const enabledTaskCount = tasks.filter((t) => t.enabled).length;

  // Query recent executions for all project tasks
  const projectExecutions = await ctx.documentStore.query<import('@nous/shared').TaskExecutionRecord>(
    'task_executions',
    { where: { projectId: project.id } },
  );

  // Sort by triggeredAt descending, take recent 10
  const sortedRecent = projectExecutions
    .sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt))
    .slice(0, 10);

  const recentFailureCount = sortedRecent.filter((e) => e.status === 'failed').length;

  const taskSummary = {
    totalCount: tasks.length,
    enabledCount: enabledTaskCount,
    recentExecutions: sortedRecent.map((e) => ({
      taskId: e.taskDefinitionId,
      taskName: tasks.find((t) => t.id === e.taskDefinitionId)?.name ?? 'Unknown',
      status: e.status,
      triggeredAt: e.triggeredAt,
    })),
  };

  const health = deriveHealthSummary(
    workflowSnapshot,
    schedules,
    openEscalations,
    controlState,
    { enabledTaskCount, recentTaskFailureCount: recentFailureCount },
  );

  return ProjectDashboardSnapshotSchema.parse({
    project: getProjectIdentity(project),
    health,
    controlProjection: workflowSnapshot.controlProjection,
    workflowSnapshot,
    schedules,
    openEscalations,
    blockedActions,
    packageDefaultIntake: project.packageDefaultIntake,
    taskSummary,
    diagnostics: {
      runtimePosture: 'single_process_local',
      degradedReasonCode: workflowSnapshot.diagnostics.degradedReasonCode,
    },
  });
}

function ensureActionAllowed(
  blockedActions: ProjectBlockedAction[],
  action: ProjectBlockedAction['action'],
) {
  const match = blockedActions.find((candidate) => candidate.action === action);
  if (match && !match.allowed) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `${match.reasonCode ?? 'action_blocked'}: ${match.message}`,
    });
  }
}

export const projectsRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.projectStore.list();
  }),

  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        type: z.enum(['protocol', 'intent', 'hybrid']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString();
      const id = randomUUID() as ProjectId;
      const config = ctx.config.get() as {
        defaults?: {
          memoryAccessPolicy?: { canReadFrom: string; canBeReadBy: string; inheritsGlobal: boolean };
          escalationChannels?: string[];
        };
      };
      const defaults = config.defaults ?? {};
      const memoryAccessPolicy = (defaults.memoryAccessPolicy &&
        typeof defaults.memoryAccessPolicy === 'object' &&
        'canReadFrom' in defaults.memoryAccessPolicy &&
        'canBeReadBy' in defaults.memoryAccessPolicy &&
        'inheritsGlobal' in defaults.memoryAccessPolicy
        ? defaults.memoryAccessPolicy
        : { canReadFrom: 'all', canBeReadBy: 'all', inheritsGlobal: true }) as {
          canReadFrom: 'all' | 'none';
          canBeReadBy: 'all' | 'none';
          inheritsGlobal: boolean;
        };
      const escalationChannels = (Array.isArray(defaults.escalationChannels)
        ? defaults.escalationChannels
        : ['in-app']) as ('in-app' | 'push' | 'email' | 'signal' | 'slack' | 'sms' | 'voice')[];

      await ctx.projectStore.create(ProjectConfigSchema.parse({
        id,
        name: input.name,
        type: input.type ?? 'hybrid',
        pfcTier: 3,
        governanceDefaults: {},
        memoryAccessPolicy,
        escalationChannels,
        escalationPreferences: {},
        packageDefaultIntake: [],
        retrievalBudgetTokens: 500,
        createdAt: now,
        updatedAt: now,
      }));

      const created = await ctx.projectStore.get(id);
      if (!created) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Project creation failed',
        });
      }
      return created;
    }),

  get: publicProcedure
    .input(z.object({ id: ProjectIdSchema }))
    .query(async ({ ctx, input }) => {
      return ctx.projectStore.get(input.id);
    }),

  workflowSnapshot: publicProcedure
    .input(
      z.object({
        projectId: ProjectIdSchema,
        runId: WorkflowExecutionIdSchema.optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const project = await getProjectOrThrow(ctx, input.projectId);
      return buildWorkflowSnapshot(ctx, project, input.runId);
    }),

  workflowVisualDebugSnapshot: publicProcedure
    .input(
      z.object({
        projectId: ProjectIdSchema,
        runId: WorkflowExecutionIdSchema.optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const project = await getProjectOrThrow(ctx, input.projectId);
      return buildWorkflowVisualDebugSnapshot(ctx, project, input.runId);
    }),

  workflowNodeInspect: publicProcedure
    .input(
      z.object({
        projectId: ProjectIdSchema,
        runId: WorkflowExecutionIdSchema.optional(),
        nodeDefinitionId: WorkflowNodeDefinitionIdSchema,
      }),
    )
    .query(async ({ ctx, input }) => {
      const project = await getProjectOrThrow(ctx, input.projectId);
      return buildNodeInspectProjection(ctx, project, {
        nodeDefinitionId: input.nodeDefinitionId,
        runId: input.runId,
      });
    }),

  dashboardSnapshot: publicProcedure
    .input(z.object({ projectId: ProjectIdSchema }))
    .query(async ({ ctx, input }) => {
      const project = await getProjectOrThrow(ctx, input.projectId);
      return buildProjectDashboardSnapshot(ctx, project);
    }),

  configurationSnapshot: publicProcedure
    .input(z.object({ projectId: ProjectIdSchema }))
    .query(async ({ ctx, input }) => {
      const project = await getProjectOrThrow(ctx, input.projectId);
      return buildConfigurationSnapshot(ctx, project);
    }),

  updateConfiguration: publicProcedure
    .input(ProjectConfigurationUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const project = await getProjectOrThrow(ctx, input.projectId);
      if (input.expectedUpdatedAt && input.expectedUpdatedAt !== project.updatedAt) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'configuration_conflict: expectedUpdatedAt no longer matches project.updatedAt',
        });
      }

      const controlState = await getProjectControlState(ctx, input.projectId);
      const blockedActions = deriveBlockedActions(controlState);
      ensureActionAllowed(blockedActions, 'edit_project_configuration');

      // Transactional order per settings-update-schema-extension-v1 §3:
      //   1) apply `updates` against the stored overrides
      //   2) drop every field named in `resetFields` (pass `undefined` so the
      //      document-store merge + subsequent ProjectDocumentSchema.parse
      //      strip the key for optional fields)
      //   3) buildConfigurationSnapshot runs against the re-fetched project
      //      and re-emits provenance
      const persistPayload: Record<string, unknown> = { ...input.updates };
      if (input.resetFields) {
        for (const field of input.resetFields) {
          persistPayload[field] = undefined;
        }
      }

      await ctx.projectStore.update(
        input.projectId,
        persistPayload as Partial<ProjectConfig>,
      );
      const updated = await getProjectOrThrow(ctx, input.projectId);
      return buildConfigurationSnapshot(ctx, updated);
    }),

  archive: publicProcedure
    .input(z.object({ projectId: ProjectIdSchema }))
    .mutation(async ({ ctx, input }) => {
      await getProjectOrThrow(ctx, input.projectId);
      const controlState = await getProjectControlState(ctx, input.projectId);
      const blockedActions = deriveBlockedActions(controlState);
      ensureActionAllowed(blockedActions, 'archive_project');
      await ctx.projectStore.archive(input.projectId);
      const archived = await ctx.projectStore.get(input.projectId);
      if (!archived) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'archive_read_back_failed',
        });
      }
      return archived;
    }),

  unarchive: publicProcedure
    .input(z.object({ projectId: ProjectIdSchema }))
    .mutation(async ({ ctx, input }) => {
      // NOTE: `ctx.projectStore.list()` excludes archived projects but
      // `ctx.projectStore.get()` still returns them, so `getProjectOrThrow`
      // (which uses `get`) correctly maps truly missing projects to
      // NOT_FOUND while still resolving archived projects for unarchive.
      await getProjectOrThrow(ctx, input.projectId);
      await ctx.projectStore.unarchive(input.projectId);
      const unarchived = await getProjectOrThrow(ctx, input.projectId);
      return unarchived;
    }),

  upsertSchedule: publicProcedure
    .input(ScheduleUpsertInputSchema)
    .mutation(async ({ ctx, input }) => {
      const project = await getProjectOrThrow(ctx, input.projectId);
      const controlState = await getProjectControlState(ctx, input.projectId);
      const blockedActions = deriveBlockedActions(controlState);
      ensureActionAllowed(blockedActions, 'update_schedule');

      if (!project.workflow?.definitions.length && !input.workflowDefinitionId) {
        const hasBoundDefinitions =
          (project.workflow?.packageBindings?.length ?? 0) > 0;
        if (!hasBoundDefinitions) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'schedule_requires_workflow_definition: project has no canonical workflow definition',
          });
        }
      }

      return ScheduleDefinitionSchema.parse(
        await ctx.schedulerService.upsert(input),
      );
    }),

  validateWorkflowDefinition: publicProcedure
    .input(
      z.object({
        projectId: ProjectIdSchema,
        workflowDefinition: z.unknown(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await getProjectOrThrow(ctx, input.projectId);
      return validateDraftDefinition(input.projectId, input.workflowDefinition);
    }),

  saveWorkflowDefinition: publicProcedure
    .input(
      z.object({
        projectId: ProjectIdSchema,
        workflowDefinition: z.unknown(),
        setAsDefault: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await getProjectOrThrow(ctx, input.projectId);
      const validation = validateDraftDefinition(input.projectId, input.workflowDefinition);

      if (!validation.valid || !validation.definition) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: validation.issues.map((issue) => issue.message).join('; '),
        });
      }

      const saveInput = SaveWorkflowDefinitionInputSchema.parse({
        projectId: input.projectId,
        workflowDefinition: validation.definition,
        setAsDefault: input.setAsDefault,
      });

      const currentDefinitions = getWorkflowDefinitions(project);
      const nextDefinitions = currentDefinitions.some(
        (definition) => definition.id === saveInput.workflowDefinition.id,
      )
        ? currentDefinitions.map((definition) =>
            definition.id === saveInput.workflowDefinition.id
              ? saveInput.workflowDefinition
              : definition)
        : [...currentDefinitions, saveInput.workflowDefinition];

      await ctx.projectStore.update(input.projectId, {
        workflow: {
          definitions: nextDefinitions,
          packageBindings: project.workflow?.packageBindings ?? [],
          defaultWorkflowDefinitionId: saveInput.setAsDefault
            ? saveInput.workflowDefinition.id
            : project.workflow?.defaultWorkflowDefinitionId ??
              saveInput.workflowDefinition.id,
        },
      });

      const updatedProject = await getProjectOrThrow(ctx, input.projectId);
      return {
        project: updatedProject,
        validation,
      };
    }),

  /**
   * Save a workflow definition from a YAML spec string.
   * Parses, validates, converts via specToWorkflowDefinition, and upserts into definitions[].
   * When definitionId is provided, upserts the matching definition; otherwise creates a new one.
   */
  saveWorkflowSpec: publicProcedure
    .input(
      z.object({
        projectId: ProjectIdSchema,
        specYaml: z.string().min(1),
        definitionId: z.string().optional(),
        name: z.string().min(1).optional(),
        setAsDefault: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await getProjectOrThrow(ctx, input.projectId);

      const parseResult = parseWorkflowSpec(input.specYaml);
      if (!parseResult.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: parseResult.errors.map((e) => e.message).join('; '),
        });
      }

      let definition;
      try {
        definition = specToWorkflowDefinition(parseResult.data, {
          definitionId: input.definitionId,
          projectId: input.projectId,
        });
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Spec conversion failed: ${(error as Error).message}`,
        });
      }

      // Override name if provided
      if (input.name) {
        definition = { ...definition, name: input.name };
      }

      // Attach specYaml to definition (may survive schema parsing) and store in specYamlStore (guaranteed to survive)
      definition = { ...definition, specYaml: input.specYaml };

      const currentDefinitions = getWorkflowDefinitions(project);
      const nextDefinitions = currentDefinitions.some(
        (d) => d.id === definition.id,
      )
        ? currentDefinitions.map((d) =>
            d.id === definition.id ? definition : d)
        : [...currentDefinitions, definition];

      // Store specYaml in dedicated map keyed by definition ID (survives schema parsing)
      const specYamlStore = { ...(project.workflow?.specYamlStore ?? {}), [definition.id]: input.specYaml };

      await ctx.projectStore.update(input.projectId, {
        workflow: {
          definitions: nextDefinitions,
          packageBindings: project.workflow?.packageBindings ?? [],
          defaultWorkflowDefinitionId: input.setAsDefault
            ? definition.id
            : project.workflow?.defaultWorkflowDefinitionId ?? definition.id,
          specYamlStore,
        },
      });

      // Emit SSE signal after persistence completes (signal-to-refetch pattern)
      ctx.eventBus.publish('workflow:spec-updated', {
        projectId: input.projectId,
        definitionId: definition.id,
      });

      return {
        definitionId: definition.id,
        validation: { valid: true },
      };
    }),

  /** List workflow definitions for a project (summary form). */
  listWorkflowDefinitions: publicProcedure
    .input(z.object({ projectId: ProjectIdSchema }))
    .query(async ({ ctx, input }) => {
      const project = await getProjectOrThrow(ctx, input.projectId);
      const definitions = getWorkflowDefinitions(project);
      const defaultId = project.workflow?.defaultWorkflowDefinitionId;

      return definitions.map((d) => ({
        id: d.id,
        name: d.name,
        version: d.version,
        isDefault: d.id === defaultId,
      }));
    }),

  /** Get a single workflow definition by ID, including stored specYaml. */
  getWorkflowDefinition: publicProcedure
    .input(
      z.object({
        projectId: ProjectIdSchema,
        definitionId: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const project = await getProjectOrThrow(ctx, input.projectId);
      const definitions = getWorkflowDefinitions(project);
      const definition = definitions.find((d) => d.id === input.definitionId);

      if (!definition) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Workflow definition ${input.definitionId} not found`,
        });
      }

      // Ensure specYaml is present — read from specYamlStore if stripped from definition by schema parsing
      const specYaml = definition.specYaml ?? project.workflow?.specYamlStore?.[input.definitionId];
      return { ...definition, specYaml };
    }),

  /** Delete a workflow definition by ID. Clears default if needed. */
  deleteWorkflowDefinition: publicProcedure
    .input(
      z.object({
        projectId: ProjectIdSchema,
        definitionId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await getProjectOrThrow(ctx, input.projectId);
      const currentDefinitions = getWorkflowDefinitions(project);
      const nextDefinitions = currentDefinitions.filter(
        (d) => d.id !== input.definitionId,
      );

      const deleted = nextDefinitions.length < currentDefinitions.length;

      if (deleted) {
        const defaultId = project.workflow?.defaultWorkflowDefinitionId;
        // Clean up specYamlStore entry
        const specYamlStore = { ...(project.workflow?.specYamlStore ?? {}) };
        delete specYamlStore[input.definitionId];
        await ctx.projectStore.update(input.projectId, {
          workflow: {
            definitions: nextDefinitions,
            packageBindings: project.workflow?.packageBindings ?? [],
            defaultWorkflowDefinitionId:
              defaultId === input.definitionId ? undefined : defaultId,
            specYamlStore,
          },
        });
      }

      return { deleted };
    }),

  /** Rename a workflow definition by ID. */
  renameWorkflowDefinition: publicProcedure
    .input(
      z.object({
        projectId: ProjectIdSchema,
        definitionId: z.string().min(1),
        name: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await getProjectOrThrow(ctx, input.projectId);
      const currentDefinitions = getWorkflowDefinitions(project);
      const target = currentDefinitions.find((d) => d.id === input.definitionId);

      if (!target) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Workflow definition ${input.definitionId} not found`,
        });
      }

      const nextDefinitions = currentDefinitions.map((d) =>
        d.id === input.definitionId ? { ...d, name: input.name } : d,
      );

      await ctx.projectStore.update(input.projectId, {
        workflow: {
          definitions: nextDefinitions,
          packageBindings: project.workflow?.packageBindings ?? [],
          defaultWorkflowDefinitionId: project.workflow?.defaultWorkflowDefinitionId,
          specYamlStore: project.workflow?.specYamlStore ?? {},
        },
      });

      return { renamed: true };
    }),
});
