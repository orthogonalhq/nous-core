import { randomUUID } from 'node:crypto';
import {
  WorkflowRunStateSchema,
  type DerivedWorkflowGraph,
  type WorkflowAdmissionResult,
  type WorkflowDispatchLineage,
  type WorkflowDispatchLineageId,
  type WorkflowExecutionId,
  type WorkflowNodeDefinitionId,
  type WorkflowNodeRunId,
  type WorkflowRunState,
  type WorkflowTransitionInput,
} from '@nous/shared';
import {
  getInitialReadyNodeIds,
  getNextReadyNodeIds,
  sortNodeIdsByTopology,
} from './traversal.js';

export interface CreateInitialWorkflowRunStateInput {
  runId: WorkflowExecutionId;
  graph: DerivedWorkflowGraph;
  admission: WorkflowAdmissionResult;
  transition?: WorkflowTransitionInput;
  startedAt?: string;
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
  attempt?: number;
}): WorkflowDispatchLineage => ({
  id: randomUUID() as WorkflowDispatchLineageId,
  runId: input.runId,
  nodeDefinitionId: input.nodeDefinitionId,
  parentNodeDefinitionId: input.parentNodeDefinitionId,
  viaEdgeId: input.viaEdgeId as WorkflowDispatchLineage['viaEdgeId'],
  attempt: input.attempt ?? 0,
  reasonCode: input.reasonCode,
  evidenceRefs: input.evidenceRefs,
  occurredAt: input.occurredAt,
});

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
          attempt: 0,
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
    readyNodeIds,
    completedNodeIds: [],
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
  nextState.status = nextState.completedNodeIds.length === 0 ? 'running' : 'running';
  nextState.reasonCode = transition.reasonCode;
  nextState.evidenceRefs = transition.evidenceRefs;
  nextState.updatedAt = occurredAt(transition, state.updatedAt);
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

  if (!['ready', 'running', 'dispatched'].includes(nodeState.status)) {
    throw new Error(
      `Workflow node ${nodeDefinitionId} cannot be completed from status ${nodeState.status}`,
    );
  }

  const timestamp = occurredAt(transition, state.updatedAt);
  nodeState.status = 'completed';
  nodeState.reasonCode = transition.reasonCode;
  nodeState.evidenceRefs = transition.evidenceRefs;
  nodeState.updatedAt = timestamp;

  nextState.readyNodeIds = nextState.readyNodeIds.filter(
    (readyNodeId) => readyNodeId !== nodeDefinitionId,
  );
  nextState.completedNodeIds = sortNodeIdsByTopology(graph, [
    ...nextState.completedNodeIds,
    nodeDefinitionId,
  ]);

  const newReadyNodeIds = getNextReadyNodeIds(
    graph,
    nextState.completedNodeIds,
    nodeDefinitionId,
  ).filter(
    (candidateNodeId) =>
      !nextState.readyNodeIds.includes(candidateNodeId) &&
      !nextState.completedNodeIds.includes(candidateNodeId),
  );

  for (const readyNodeId of newReadyNodeIds) {
    const lineage = createDispatchLineage({
      runId: nextState.runId,
      nodeDefinitionId: readyNodeId,
      parentNodeDefinitionId: nodeDefinitionId,
      viaEdgeId:
        graph.nodes[nodeDefinitionId]?.outboundEdgeIds.find(
          (edgeId) => graph.edges[edgeId]?.to === readyNodeId,
        ) ?? undefined,
      attempt: nextState.nodeStates[readyNodeId]?.attempt ?? 0,
      reasonCode: 'node_ready',
      evidenceRefs: transition.evidenceRefs,
      occurredAt: timestamp,
    });

    nextState.dispatchLineage.push(lineage);
    nextState.readyNodeIds.push(readyNodeId);
    nextState.nodeStates[readyNodeId].status = 'ready';
    nextState.nodeStates[readyNodeId].reasonCode = 'node_ready';
    nextState.nodeStates[readyNodeId].evidenceRefs = transition.evidenceRefs;
    nextState.nodeStates[readyNodeId].lastDispatchLineageId = lineage.id;
    nextState.nodeStates[readyNodeId].updatedAt = timestamp;
  }

  nextState.readyNodeIds = sortNodeIdsByTopology(graph, nextState.readyNodeIds);
  nextState.status =
    nextState.completedNodeIds.length === graph.topologicalOrder.length
      ? 'completed'
      : 'running';
  nextState.reasonCode = transition.reasonCode;
  nextState.evidenceRefs = transition.evidenceRefs;
  nextState.updatedAt = timestamp;

  return WorkflowRunStateSchema.parse(nextState);
}
