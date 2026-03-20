import { randomUUID } from 'node:crypto';
import {
  WorkflowRunStateSchema,
  type DerivedWorkflowGraph,
  type WorkflowAdmissionResult,
  type WorkflowCheckpointState,
  type WorkflowDispatchLineage,
  type WorkflowDispatchLineageId,
  type WorkflowExecutionId,
  type WorkflowNodeAttempt,
  type WorkflowNodeDefinitionId,
  type WorkflowNodeExecutionResult,
  type WorkflowNodeRunId,
  type WorkflowRunState,
  type WorkflowRunTriggerContext,
  type WorkflowTransitionInput,
} from '@nous/shared';
import {
  getActivatedOutboundEdgeIds,
  getInitialReadyNodeIds,
  getNextReadyNodeIds,
  sortNodeIdsByTopology,
} from './traversal.js';

export interface CreateInitialWorkflowRunStateInput {
  runId: WorkflowExecutionId;
  graph: DerivedWorkflowGraph;
  admission: WorkflowAdmissionResult;
  triggerContext?: WorkflowRunTriggerContext;
  transition?: WorkflowTransitionInput;
  startedAt?: string;
}

export interface RecordWorkflowNodeExecutionInput {
  state: WorkflowRunState;
  graph: DerivedWorkflowGraph;
  nodeDefinitionId: WorkflowNodeDefinitionId;
  result: WorkflowNodeExecutionResult;
  transition: WorkflowTransitionInput;
  checkpointState?: WorkflowCheckpointState;
  lastPreparedCheckpointId?: string;
  lastCommittedCheckpointId?: string;
}

export interface ResolveWorkflowNodeContinuationInput {
  state: WorkflowRunState;
  graph: DerivedWorkflowGraph;
  nodeDefinitionId: WorkflowNodeDefinitionId;
  result: WorkflowNodeExecutionResult;
  transition: WorkflowTransitionInput;
  checkpointState?: WorkflowCheckpointState;
  lastPreparedCheckpointId?: string;
  lastCommittedCheckpointId?: string;
}

const clone = <T>(value: T): T => structuredClone(value);

const occurredAt = (
  transition?: WorkflowTransitionInput,
  fallback?: string,
): string => transition?.occurredAt ?? fallback ?? new Date().toISOString();

const createDispatchLineage = (input: {
  runId: WorkflowExecutionId;
  nodeDefinitionId: WorkflowNodeDefinitionId;
  reasonCode: string;
  evidenceRefs: string[];
  occurredAt: string;
  parentNodeDefinitionId?: WorkflowNodeDefinitionId;
  viaEdgeId?: string;
  branchKey?: string;
  attempt?: number;
}): WorkflowDispatchLineage => ({
  id: randomUUID() as WorkflowDispatchLineageId,
  runId: input.runId,
  nodeDefinitionId: input.nodeDefinitionId,
  parentNodeDefinitionId: input.parentNodeDefinitionId,
  viaEdgeId: input.viaEdgeId as WorkflowDispatchLineage['viaEdgeId'],
  branchKey: input.branchKey,
  attempt: input.attempt ?? 0,
  reasonCode: input.reasonCode,
  evidenceRefs: input.evidenceRefs,
  occurredAt: input.occurredAt,
});

const mapOutcomeToStatus = (
  outcome: WorkflowNodeExecutionResult['outcome'],
): 'completed' | 'waiting' | 'blocked' | 'failed' => {
  switch (outcome) {
    case 'completed':
      return 'completed';
    case 'waiting':
      return 'waiting';
    case 'blocked':
      return 'blocked';
    case 'failed':
    default:
      return 'failed';
  }
};

const removeNodeId = (
  values: WorkflowNodeDefinitionId[],
  nodeDefinitionId: WorkflowNodeDefinitionId,
): WorkflowNodeDefinitionId[] =>
  values.filter((value) => value !== nodeDefinitionId);

const resolveRunStatus = (state: WorkflowRunState): WorkflowRunState['status'] => {
  if (state.status === 'paused') {
    return 'paused';
  }

  if (
    Object.values(state.nodeStates).some((nodeState) => nodeState.status === 'failed')
  ) {
    return 'failed';
  }

  if (state.blockedNodeIds.length > 0) {
    return 'blocked_review';
  }

  if (state.waitingNodeIds.length > 0 || state.checkpointState !== 'idle') {
    return 'waiting';
  }

  const activeNodeIds = state.activeNodeIds.length > 0
    ? state.activeNodeIds
    : state.readyNodeIds;
  const allActiveNodesResolved =
    activeNodeIds.length > 0 &&
    activeNodeIds.every((nodeDefinitionId) =>
      ['completed', 'skipped'].includes(state.nodeStates[nodeDefinitionId]?.status),
    );

  if (
    allActiveNodesResolved &&
    state.readyNodeIds.length === 0 &&
    state.waitingNodeIds.length === 0 &&
    state.blockedNodeIds.length === 0
  ) {
    return 'completed';
  }

  if (state.readyNodeIds.length > 0) {
    return state.completedNodeIds.length === 0 ? 'ready' : 'running';
  }

  return 'running';
};

const updateCheckpointFields = (
  nextState: WorkflowRunState,
  checkpointState?: WorkflowCheckpointState,
  lastPreparedCheckpointId?: string,
  lastCommittedCheckpointId?: string,
): void => {
  if (checkpointState) {
    nextState.checkpointState = checkpointState;
  }
  if (lastPreparedCheckpointId) {
    nextState.lastPreparedCheckpointId = lastPreparedCheckpointId;
  }
  if (lastCommittedCheckpointId) {
    nextState.lastCommittedCheckpointId = lastCommittedCheckpointId;
  }
};

const activateSuccessors = (
  nextState: WorkflowRunState,
  graph: DerivedWorkflowGraph,
  nodeDefinitionId: WorkflowNodeDefinitionId,
  transition: WorkflowTransitionInput,
  selectedBranchKey?: string,
): void => {
  const timestamp = occurredAt(transition, nextState.updatedAt);
  const activatedEdgeIds = getActivatedOutboundEdgeIds(
    graph,
    nodeDefinitionId,
    selectedBranchKey,
  );

  nextState.activatedEdgeIds = [...new Set([
    ...nextState.activatedEdgeIds,
    ...activatedEdgeIds,
  ])];

  const nextReadyNodeIds = getNextReadyNodeIds(
    graph,
    nextState.completedNodeIds,
    nextState.activatedEdgeIds,
    nodeDefinitionId,
  ).filter(
    (candidateNodeId) =>
      !nextState.readyNodeIds.includes(candidateNodeId) &&
      !nextState.waitingNodeIds.includes(candidateNodeId) &&
      !nextState.blockedNodeIds.includes(candidateNodeId) &&
      !nextState.completedNodeIds.includes(candidateNodeId),
  );

  for (const readyNodeId of nextReadyNodeIds) {
    const viaEdgeId =
      graph.nodes[nodeDefinitionId]?.outboundEdgeIds.find(
        (edgeId) => graph.edges[edgeId]?.to === readyNodeId,
      ) ?? undefined;
    const branchKey = viaEdgeId ? graph.edges[viaEdgeId]?.branchKey : undefined;
    const lineage = createDispatchLineage({
      runId: nextState.runId,
      nodeDefinitionId: readyNodeId,
      parentNodeDefinitionId: nodeDefinitionId,
      viaEdgeId,
      branchKey,
      attempt: nextState.nodeStates[readyNodeId]?.attempts.length ?? 0,
      reasonCode: 'node_ready',
      evidenceRefs: transition.evidenceRefs,
      occurredAt: timestamp,
    });

    nextState.dispatchLineage.push(lineage);
    nextState.activeNodeIds = sortNodeIdsByTopology(graph, [
      ...nextState.activeNodeIds,
      readyNodeId,
    ]);
    nextState.readyNodeIds = sortNodeIdsByTopology(graph, [
      ...nextState.readyNodeIds,
      readyNodeId,
    ]);

    const readyNodeState = nextState.nodeStates[readyNodeId];
    readyNodeState.status = 'ready';
    readyNodeState.reasonCode = 'node_ready';
    readyNodeState.evidenceRefs = transition.evidenceRefs;
    readyNodeState.lastDispatchLineageId = lineage.id;
    readyNodeState.updatedAt = timestamp;
  }
};

const applyAttemptOutcome = (
  nextState: WorkflowRunState,
  graph: DerivedWorkflowGraph,
  nodeDefinitionId: WorkflowNodeDefinitionId,
  attempt: WorkflowNodeAttempt,
  result: WorkflowNodeExecutionResult,
  transition: WorkflowTransitionInput,
): void => {
  const nodeState = nextState.nodeStates[nodeDefinitionId];
  const timestamp = occurredAt(transition, nextState.updatedAt);

  nextState.readyNodeIds = removeNodeId(nextState.readyNodeIds, nodeDefinitionId);
  nextState.waitingNodeIds = removeNodeId(nextState.waitingNodeIds, nodeDefinitionId);
  nextState.blockedNodeIds = removeNodeId(nextState.blockedNodeIds, nodeDefinitionId);

  nodeState.status = mapOutcomeToStatus(result.outcome);
  nodeState.latestGovernanceDecision = result.governanceDecision;
  nodeState.reasonCode = result.reasonCode;
  nodeState.evidenceRefs = result.evidenceRefs;
  nodeState.activeWaitState = result.waitState;
  nodeState.lastCommittedCheckpointId =
    result.checkpointId ?? nodeState.lastCommittedCheckpointId;
  nodeState.selectedBranchKey = result.selectedBranchKey;
  nodeState.updatedAt = timestamp;

  if (result.correctionArc) {
    nodeState.correctionArcs.push(result.correctionArc);
  }

  if (result.outcome === 'completed') {
    nodeState.activeAttempt = null;
    nodeState.activeWaitState = undefined;
    nextState.completedNodeIds = sortNodeIdsByTopology(graph, [
      ...nextState.completedNodeIds,
      nodeDefinitionId,
    ]);
    activateSuccessors(
      nextState,
      graph,
      nodeDefinitionId,
      transition,
      attempt.selectedBranchKey ?? result.selectedBranchKey,
    );
    return;
  }

  if (result.outcome === 'waiting') {
    nodeState.activeAttempt = attempt.attempt;
    nextState.waitingNodeIds = sortNodeIdsByTopology(graph, [
      ...nextState.waitingNodeIds,
      nodeDefinitionId,
    ]);
    return;
  }

  if (result.outcome === 'blocked') {
    nodeState.activeAttempt = attempt.attempt;
    nextState.blockedNodeIds = sortNodeIdsByTopology(graph, [
      ...nextState.blockedNodeIds,
      nodeDefinitionId,
    ]);
    return;
  }

  nodeState.activeAttempt = null;
};

export function createInitialWorkflowRunState(
  input: CreateInitialWorkflowRunStateInput,
): WorkflowRunState {
  if (!input.admission.allowed) {
    throw new Error('Cannot create workflow run state for blocked admission');
  }

  const timestamp = occurredAt(input.transition, input.startedAt);
  const transition = input.transition ?? {
    reasonCode: 'workflow_started',
    evidenceRefs: [],
  };
  const readyNodeIds = getInitialReadyNodeIds(input.graph);
  const dispatchLineage: WorkflowDispatchLineage[] = [];
  const nodeStates = Object.fromEntries(
    input.graph.topologicalOrder.map((nodeDefinitionId) => {
      const nodeRunId = randomUUID() as WorkflowNodeRunId;
      const isReady = readyNodeIds.includes(nodeDefinitionId);
      const lineage = isReady
        ? createDispatchLineage({
            runId: input.runId,
            nodeDefinitionId,
            reasonCode: transition.reasonCode,
            evidenceRefs: transition.evidenceRefs,
            occurredAt: timestamp,
          })
        : undefined;
      if (lineage) {
        dispatchLineage.push(lineage);
      }

      return [
        nodeDefinitionId,
        {
          id: nodeRunId,
          nodeDefinitionId,
          status: isReady ? 'ready' : 'pending',
          attempts: [],
          activeAttempt: null,
          correctionArcs: [],
          reasonCode: isReady ? transition.reasonCode : undefined,
          evidenceRefs: isReady ? transition.evidenceRefs : [],
          lastDispatchLineageId: lineage?.id,
          updatedAt: timestamp,
        },
      ];
    }),
  );

  return WorkflowRunStateSchema.parse({
    runId: input.runId,
    workflowDefinitionId: input.graph.workflowDefinitionId,
    projectId: input.graph.projectId,
    workflowVersion: input.graph.version,
    graphDigest: input.graph.graphDigest,
    status: 'ready',
    admission: input.admission,
    reasonCode: transition.reasonCode,
    evidenceRefs: transition.evidenceRefs,
    activeNodeIds: readyNodeIds,
    activatedEdgeIds: [],
    readyNodeIds,
    waitingNodeIds: [],
    blockedNodeIds: [],
    completedNodeIds: [],
    checkpointState: 'idle',
    triggerContext: input.triggerContext,
    nodeStates,
    dispatchLineage,
    startedAt: timestamp,
    updatedAt: timestamp,
  });
}

export function pauseWorkflowRunState(
  state: WorkflowRunState,
  transition: WorkflowTransitionInput,
): WorkflowRunState {
  if (
    ['admission_blocked', 'paused', 'completed', 'failed', 'canceled'].includes(
      state.status,
    )
  ) {
    throw new Error(
      `Workflow run ${state.runId} cannot be paused from status ${state.status}`,
    );
  }

  const nextState = clone(state);
  nextState.status = 'paused';
  nextState.reasonCode = transition.reasonCode;
  nextState.evidenceRefs = transition.evidenceRefs;
  nextState.updatedAt = occurredAt(transition, state.updatedAt);
  return WorkflowRunStateSchema.parse(nextState);
}

export function resumeWorkflowRunState(
  state: WorkflowRunState,
  transition: WorkflowTransitionInput,
): WorkflowRunState {
  const nextState = clone(state);
  if (nextState.status !== 'paused') {
    throw new Error(
      `Workflow run ${nextState.runId} cannot be resumed from status ${nextState.status}`,
    );
  }
  nextState.status = 'running';
  nextState.reasonCode = transition.reasonCode;
  nextState.evidenceRefs = transition.evidenceRefs;
  nextState.updatedAt = occurredAt(transition, state.updatedAt);
  nextState.status = resolveRunStatus(nextState);
  return WorkflowRunStateSchema.parse(nextState);
}

export function cancelWorkflowRunState(
  state: WorkflowRunState,
  transition: WorkflowTransitionInput,
): WorkflowRunState {
  if (['completed', 'failed', 'canceled'].includes(state.status)) {
    throw new Error(
      `Workflow run ${state.runId} cannot be canceled from status ${state.status}`,
    );
  }

  const nextState = clone(state);
  const timestamp = occurredAt(transition, state.updatedAt);
  const affectedNodeIds = new Set<WorkflowNodeDefinitionId>([
    ...nextState.activeNodeIds,
    ...nextState.readyNodeIds,
    ...nextState.waitingNodeIds,
    ...nextState.blockedNodeIds,
  ]);

  for (const nodeDefinitionId of affectedNodeIds) {
    const nodeState = nextState.nodeStates[nodeDefinitionId];
    if (!nodeState) {
      continue;
    }
    nodeState.activeAttempt = null;
    nodeState.activeWaitState = undefined;
    nodeState.reasonCode = transition.reasonCode;
    nodeState.evidenceRefs = transition.evidenceRefs;
    nodeState.updatedAt = timestamp;
  }

  nextState.status = 'canceled';
  nextState.reasonCode = transition.reasonCode;
  nextState.evidenceRefs = transition.evidenceRefs;
  nextState.activeNodeIds = [];
  nextState.readyNodeIds = [];
  nextState.waitingNodeIds = [];
  nextState.blockedNodeIds = [];
  nextState.checkpointState = 'idle';
  nextState.updatedAt = timestamp;
  return WorkflowRunStateSchema.parse(nextState);
}

export function completeWorkflowNodeInRunState(
  state: WorkflowRunState,
  graph: DerivedWorkflowGraph,
  nodeDefinitionId: WorkflowNodeDefinitionId,
  transition: WorkflowTransitionInput,
): WorkflowRunState {
  const nextState = clone(state);
  const nodeState = nextState.nodeStates[nodeDefinitionId];
  if (!nodeState) {
    throw new Error(`Unknown workflow node definition id: ${nodeDefinitionId}`);
  }

  if (!['ready', 'running'].includes(nodeState.status)) {
    throw new Error(
      `Workflow node ${nodeDefinitionId} cannot be completed from status ${nodeState.status}`,
    );
  }

  const timestamp = occurredAt(transition, state.updatedAt);
  nodeState.status = 'completed';
  nodeState.reasonCode = transition.reasonCode;
  nodeState.evidenceRefs = transition.evidenceRefs;
  nodeState.updatedAt = timestamp;
  nodeState.activeWaitState = undefined;

  nextState.readyNodeIds = removeNodeId(nextState.readyNodeIds, nodeDefinitionId);
  nextState.waitingNodeIds = removeNodeId(nextState.waitingNodeIds, nodeDefinitionId);
  nextState.blockedNodeIds = removeNodeId(nextState.blockedNodeIds, nodeDefinitionId);
  nextState.completedNodeIds = sortNodeIdsByTopology(graph, [
    ...nextState.completedNodeIds,
    nodeDefinitionId,
  ]);

  activateSuccessors(nextState, graph, nodeDefinitionId, transition, nodeState.selectedBranchKey);

  nextState.reasonCode = transition.reasonCode;
  nextState.evidenceRefs = transition.evidenceRefs;
  nextState.updatedAt = timestamp;
  nextState.status = resolveRunStatus(nextState);

  return WorkflowRunStateSchema.parse(nextState);
}

export function recordWorkflowNodeExecution(
  input: RecordWorkflowNodeExecutionInput,
): WorkflowRunState {
  const nextState = clone(input.state);
  const nodeState = nextState.nodeStates[input.nodeDefinitionId];
  if (!nodeState) {
    throw new Error(
      `Unknown workflow node definition id: ${input.nodeDefinitionId}`,
    );
  }

  if (nodeState.status !== 'ready') {
    throw new Error(
      `Workflow node ${input.nodeDefinitionId} cannot be executed from status ${nodeState.status}`,
    );
  }

  const timestamp = occurredAt(input.transition, input.state.updatedAt);
  const previousDispatchLineage = nextState.dispatchLineage.find(
    (lineage) => lineage.id === nodeState.lastDispatchLineageId,
  );
  const dispatchLineage = createDispatchLineage({
    runId: nextState.runId,
    nodeDefinitionId: input.nodeDefinitionId,
    parentNodeDefinitionId: previousDispatchLineage?.parentNodeDefinitionId,
    viaEdgeId: previousDispatchLineage?.viaEdgeId,
    branchKey: previousDispatchLineage?.branchKey,
    attempt: nodeState.attempts.length + 1,
    reasonCode: input.transition.reasonCode,
    evidenceRefs: input.transition.evidenceRefs,
    occurredAt: timestamp,
  });
  nextState.dispatchLineage.push(dispatchLineage);

  const attempt: WorkflowNodeAttempt = {
    attempt: nodeState.attempts.length + 1,
    status: mapOutcomeToStatus(input.result.outcome),
    dispatchLineageId: dispatchLineage.id,
    governanceDecision: input.result.governanceDecision,
    waitState: input.result.waitState,
    sideEffectStatus: input.result.sideEffectStatus,
    checkpointId: input.result.checkpointId,
    outputRef: input.result.outputRef,
    selectedBranchKey: input.result.selectedBranchKey,
    reasonCode: input.result.reasonCode,
    evidenceRefs: input.result.evidenceRefs,
    startedAt: timestamp,
    updatedAt: timestamp,
    completedAt: input.result.outcome === 'completed' ? timestamp : undefined,
  };

  nodeState.attempts.push(attempt);
  nodeState.lastDispatchLineageId = dispatchLineage.id;
  updateCheckpointFields(
    nextState,
    input.checkpointState,
    input.lastPreparedCheckpointId,
    input.lastCommittedCheckpointId,
  );
  applyAttemptOutcome(
    nextState,
    input.graph,
    input.nodeDefinitionId,
    attempt,
    input.result,
    input.transition,
  );
  nextState.reasonCode = input.transition.reasonCode;
  nextState.evidenceRefs = input.transition.evidenceRefs;
  nextState.updatedAt = timestamp;
  nextState.status = resolveRunStatus(nextState);

  return WorkflowRunStateSchema.parse(nextState);
}

export function resolveWorkflowNodeContinuation(
  input: ResolveWorkflowNodeContinuationInput,
): WorkflowRunState {
  const nextState = clone(input.state);
  const nodeState = nextState.nodeStates[input.nodeDefinitionId];
  if (!nodeState) {
    throw new Error(
      `Unknown workflow node definition id: ${input.nodeDefinitionId}`,
    );
  }

  if (nodeState.activeAttempt == null) {
    throw new Error(
      `Workflow node ${input.nodeDefinitionId} has no active attempt to continue`,
    );
  }

  const attempt = nodeState.attempts.find(
    (candidate) => candidate.attempt === nodeState.activeAttempt,
  );
  if (!attempt) {
    throw new Error(
      `Workflow node ${input.nodeDefinitionId} is missing active attempt ${nodeState.activeAttempt}`,
    );
  }

  const timestamp = occurredAt(input.transition, input.state.updatedAt);
  attempt.status = mapOutcomeToStatus(input.result.outcome);
  attempt.waitState = input.result.waitState;
  attempt.sideEffectStatus = input.result.sideEffectStatus;
  attempt.checkpointId = input.result.checkpointId ?? attempt.checkpointId;
  attempt.outputRef = input.result.outputRef ?? attempt.outputRef;
  attempt.selectedBranchKey =
    input.result.selectedBranchKey ?? attempt.selectedBranchKey;
  attempt.reasonCode = input.result.reasonCode;
  attempt.evidenceRefs = input.result.evidenceRefs;
  attempt.updatedAt = timestamp;
  attempt.completedAt = input.result.outcome === 'completed' ? timestamp : undefined;
  updateCheckpointFields(
    nextState,
    input.checkpointState,
    input.lastPreparedCheckpointId,
    input.lastCommittedCheckpointId,
  );
  applyAttemptOutcome(
    nextState,
    input.graph,
    input.nodeDefinitionId,
    attempt,
    input.result,
    input.transition,
  );
  nextState.reasonCode = input.transition.reasonCode;
  nextState.evidenceRefs = input.transition.evidenceRefs;
  nextState.updatedAt = timestamp;
  nextState.status = resolveRunStatus(nextState);

  return WorkflowRunStateSchema.parse(nextState);
}
