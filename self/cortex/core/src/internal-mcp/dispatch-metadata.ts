/**
 * Dispatch metadata construction — builds per-node dispatch metadata
 * from a workflow graph and run state.
 *
 * Extracted for testability. Used by `toWorkflowInstanceSummary` in
 * capability-handlers.ts.
 */
import {
  WORKFLOW_NODE_DISPATCH_MAP,
  type DerivedWorkflowGraph,
  type WorkflowNodeDispatchMetadata,
  type WorkflowDispatchLineage,
  type WorkflowNodeDefinitionId,
} from '@nous/shared';

/**
 * Build dispatch metadata for the given ready node IDs using the graph
 * and dispatch lineage from the run state.
 *
 * For each ready node ID:
 * 1. Resolve the node definition from the graph.
 * 2. Look up the dispatch mapping from the static mapping table.
 * 3. Find any existing dispatch lineage entry for the node.
 *
 * Nodes not found in the graph are silently skipped (defensive).
 * Unknown node types fall back to { executionMode: 'internal', agentClass: null }.
 */
export function buildDispatchMetadata(input: {
  readyNodeIds: WorkflowNodeDefinitionId[];
  graph: DerivedWorkflowGraph | null | undefined;
  dispatchLineage: WorkflowDispatchLineage[];
}): WorkflowNodeDispatchMetadata[] {
  const { readyNodeIds, graph, dispatchLineage } = input;

  if (!graph || readyNodeIds.length === 0) {
    return [];
  }

  const metadata: WorkflowNodeDispatchMetadata[] = [];
  for (const nodeId of readyNodeIds) {
    const derivedNode = graph.nodes[nodeId];
    if (!derivedNode) continue; // defensive: skip if node not in graph
    const def = derivedNode.definition;
    const mapping =
      WORKFLOW_NODE_DISPATCH_MAP[def.type] ??
      ({ executionMode: 'internal' as const, agentClass: null });
    const lineageEntry = dispatchLineage.find(
      (l) => l.nodeDefinitionId === nodeId,
    );
    metadata.push({
      nodeDefinitionId: nodeId,
      nodeType: def.type,
      nodeName: def.name,
      executionMode: mapping.executionMode,
      agentClass: mapping.agentClass,
      dispatchLineageId: lineageEntry?.id,
    });
  }

  return metadata;
}
