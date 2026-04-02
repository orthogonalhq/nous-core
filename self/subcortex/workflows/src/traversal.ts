import type {
  DerivedWorkflowGraph,
  WorkflowEdgeId,
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

export function getActivatedOutboundEdgeIds(
  graph: DerivedWorkflowGraph,
  fromNodeId: WorkflowNodeDefinitionId,
  selectedBranchKey?: string,
  nodeType?: string,
): WorkflowEdgeId[] {
  const outboundEdges = (graph.nodes[fromNodeId]?.outboundEdgeIds ?? [])
    .map((edgeId) => graph.edges[edgeId])
    .filter((edge): edge is NonNullable<typeof edge> => Boolean(edge))
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        left.id.localeCompare(right.id) ||
        left.to.localeCompare(right.to),
    );

  // Parallel-split activates all outbound edges (including branch-tagged)
  if (nodeType === 'parallel-split' && !selectedBranchKey) {
    return outboundEdges.map((edge) => edge.id);
  }

  if (selectedBranchKey) {
    return outboundEdges
      .filter(
        (edge) => edge.branchKey == null || edge.branchKey === selectedBranchKey,
      )
      .map((edge) => edge.id);
  }

  return outboundEdges
    .filter((edge) => edge.branchKey == null)
    .map((edge) => edge.id);
}

export function getNextReadyNodeIds(
  graph: DerivedWorkflowGraph,
  completedNodeIds: Iterable<WorkflowNodeDefinitionId>,
  activatedEdgeIds: Iterable<WorkflowEdgeId>,
  fromNodeId?: WorkflowNodeDefinitionId,
): WorkflowNodeDefinitionId[] {
  const completed = new Set(completedNodeIds);
  const activatedEdges = new Set(activatedEdgeIds);
  const candidateNodeIds =
    fromNodeId == null
      ? graph.topologicalOrder.filter((nodeId) => !completed.has(nodeId))
      : (graph.nodes[fromNodeId]?.outboundEdgeIds ?? [])
          .filter((edgeId) => activatedEdges.has(edgeId))
          .map((edgeId) => graph.edges[edgeId]?.to);

  return sortNodeIdsByTopology(
    graph,
    candidateNodeIds.filter(
      (candidateNodeId): candidateNodeId is WorkflowNodeDefinitionId => {
        if (!candidateNodeId || completed.has(candidateNodeId)) {
          return false;
        }

        const inboundEdgeIds = graph.nodes[candidateNodeId]?.inboundEdgeIds ?? [];
        const activatedInboundEdgeIds = inboundEdgeIds.filter((edgeId) =>
          activatedEdges.has(edgeId),
        );

        if (activatedInboundEdgeIds.length === 0) {
          return false;
        }

        // Parallel-join readiness override: ready when ANY activated inbound source completes
        // (the join handler evaluates whether the full join condition is met)
        const candidateNode = graph.nodes[candidateNodeId];
        if (candidateNode?.definition?.type === 'parallel-join') {
          return activatedInboundEdgeIds.some((edgeId) =>
            completed.has(graph.edges[edgeId]?.from as WorkflowNodeDefinitionId),
          );
        }

        // Default: all activated inbound sources must be completed
        return activatedInboundEdgeIds.every((edgeId) =>
          completed.has(graph.edges[edgeId]?.from as WorkflowNodeDefinitionId),
        );
      },
    ),
  );
}
