import type {
  DerivedWorkflowGraph,
  WorkflowNodeDefinitionId,
} from '@nous/shared';

export function sortNodeIdsByTopology(
  graph: DerivedWorkflowGraph,
  nodeIds: Iterable<WorkflowNodeDefinitionId>,
): WorkflowNodeDefinitionId[] {
  return [...new Set(nodeIds)].sort((left, right) => {
    const leftIndex = graph.nodes[left]?.topologicalIndex ?? Number.MAX_SAFE_INTEGER;
    const rightIndex =
      graph.nodes[right]?.topologicalIndex ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex || left.localeCompare(right);
  });
}

export function getInitialReadyNodeIds(
  graph: DerivedWorkflowGraph,
): WorkflowNodeDefinitionId[] {
  return sortNodeIdsByTopology(graph, graph.entryNodeIds);
}

export function getNextReadyNodeIds(
  graph: DerivedWorkflowGraph,
  completedNodeIds: Iterable<WorkflowNodeDefinitionId>,
  fromNodeId?: WorkflowNodeDefinitionId,
): WorkflowNodeDefinitionId[] {
  const completed = new Set(completedNodeIds);
  const candidateNodeIds =
    fromNodeId == null
      ? graph.topologicalOrder.filter((nodeId) => !completed.has(nodeId))
      : (graph.nodes[fromNodeId]?.outboundEdgeIds ?? []).map(
          (edgeId) => graph.edges[edgeId]?.to,
        );

  return sortNodeIdsByTopology(
    graph,
    candidateNodeIds.filter(
      (candidateNodeId): candidateNodeId is WorkflowNodeDefinitionId => {
        if (!candidateNodeId || completed.has(candidateNodeId)) {
          return false;
        }
        const inboundEdgeIds = graph.nodes[candidateNodeId]?.inboundEdgeIds ?? [];
        return inboundEdgeIds.every((edgeId) =>
          completed.has(graph.edges[edgeId]?.from as WorkflowNodeDefinitionId),
        );
      },
    ),
  );
}
