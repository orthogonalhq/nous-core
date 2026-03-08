import type {
  WorkflowDefinition,
  WorkflowEdgeDefinition,
  WorkflowNodeDefinitionId,
} from '@nous/shared';

export interface WorkflowValidationIssue {
  code: string;
  message: string;
  evidenceRefs: string[];
}

export type WorkflowValidationResult =
  | {
      valid: true;
      topologicalOrder: WorkflowNodeDefinitionId[];
    }
  | {
      valid: false;
      issues: WorkflowValidationIssue[];
    };

interface QueueItem {
  nodeId: WorkflowNodeDefinitionId;
  sourceOrder: number;
  edgePriority: number;
  edgeId: string;
}

const compareQueueItems = (left: QueueItem, right: QueueItem): number =>
  left.sourceOrder - right.sourceOrder ||
  left.edgePriority - right.edgePriority ||
  left.edgeId.localeCompare(right.edgeId) ||
  left.nodeId.localeCompare(right.nodeId);

const sortEdges = (
  edges: WorkflowEdgeDefinition[],
): WorkflowEdgeDefinition[] =>
  [...edges].sort(
    (left, right) =>
      left.priority - right.priority ||
      left.id.localeCompare(right.id) ||
      left.to.localeCompare(right.to),
  );

const pushIssue = (
  issues: WorkflowValidationIssue[],
  code: string,
  message: string,
  ...evidenceRefs: string[]
): void => {
  issues.push({ code, message, evidenceRefs });
};

export function validateWorkflowDefinition(
  definition: WorkflowDefinition,
): WorkflowValidationResult {
  const issues: WorkflowValidationIssue[] = [];
  const nodesById = new Map<WorkflowNodeDefinitionId, WorkflowDefinition['nodes'][number]>();
  const edgeIds = new Set<string>();
  const incomingCount = new Map<WorkflowNodeDefinitionId, number>();
  const outgoingEdges = new Map<WorkflowNodeDefinitionId, WorkflowEdgeDefinition[]>();

  for (const node of definition.nodes) {
    if (nodesById.has(node.id)) {
      pushIssue(
        issues,
        'workflow_duplicate_node_id',
        `Duplicate workflow node definition id: ${node.id}`,
        `node_id=${node.id}`,
      );
      continue;
    }
    nodesById.set(node.id, node);
    incomingCount.set(node.id, 0);
    outgoingEdges.set(node.id, []);
  }

  for (const edge of definition.edges) {
    if (edgeIds.has(edge.id)) {
      pushIssue(
        issues,
        'workflow_duplicate_edge_id',
        `Duplicate workflow edge id: ${edge.id}`,
        `edge_id=${edge.id}`,
      );
      continue;
    }
    edgeIds.add(edge.id);

    if (!nodesById.has(edge.from) || !nodesById.has(edge.to)) {
      pushIssue(
        issues,
        'workflow_dangling_edge',
        `Edge ${edge.id} references an unknown node`,
        `edge_id=${edge.id}`,
        `from=${edge.from}`,
        `to=${edge.to}`,
      );
      continue;
    }

    if (edge.from === edge.to) {
      pushIssue(
        issues,
        'workflow_self_loop',
        `Edge ${edge.id} forms a self-loop`,
        `edge_id=${edge.id}`,
        `node_id=${edge.from}`,
      );
      continue;
    }

    incomingCount.set(edge.to, (incomingCount.get(edge.to) ?? 0) + 1);
    outgoingEdges.get(edge.from)?.push(edge);
  }

  const entryNodeIdSet = new Set(definition.entryNodeIds);
  for (const entryNodeId of definition.entryNodeIds) {
    if (!nodesById.has(entryNodeId)) {
      pushIssue(
        issues,
        'workflow_entry_node_missing',
        `Entry node ${entryNodeId} does not exist`,
        `entry_node_id=${entryNodeId}`,
      );
      continue;
    }

    if ((incomingCount.get(entryNodeId) ?? 0) > 0) {
      pushIssue(
        issues,
        'workflow_entry_node_has_inbound_edges',
        `Entry node ${entryNodeId} has inbound edges`,
        `entry_node_id=${entryNodeId}`,
      );
    }
  }

  for (const [nodeId, count] of incomingCount.entries()) {
    if (count === 0 && !entryNodeIdSet.has(nodeId)) {
      pushIssue(
        issues,
        'workflow_missing_entry_for_root_node',
        `Root node ${nodeId} is not declared as an entry node`,
        `node_id=${nodeId}`,
      );
    }
  }

  const reachable = new Set<WorkflowNodeDefinitionId>();
  const stack = [...definition.entryNodeIds];
  while (stack.length > 0) {
    const nodeId = stack.pop() as WorkflowNodeDefinitionId;
    if (reachable.has(nodeId) || !nodesById.has(nodeId)) {
      continue;
    }
    reachable.add(nodeId);
    const edges = sortEdges(outgoingEdges.get(nodeId) ?? []);
    for (const edge of edges) {
      stack.push(edge.to);
    }
  }

  for (const nodeId of nodesById.keys()) {
    if (!reachable.has(nodeId)) {
      pushIssue(
        issues,
        'workflow_unreachable_node',
        `Node ${nodeId} is unreachable from the declared entry nodes`,
        `node_id=${nodeId}`,
      );
    }
  }

  if (issues.length > 0) {
    return { valid: false, issues };
  }

  const queue: QueueItem[] = [...definition.entryNodeIds]
    .sort((left, right) => left.localeCompare(right))
    .map((nodeId) => ({
      nodeId,
      sourceOrder: -1,
      edgePriority: 0,
      edgeId: nodeId,
    }));
  const remainingInbound = new Map(incomingCount);
  const topologicalOrder: WorkflowNodeDefinitionId[] = [];

  while (queue.length > 0) {
    queue.sort(compareQueueItems);
    const current = queue.shift() as QueueItem;
    topologicalOrder.push(current.nodeId);

    const sortedOutgoing = sortEdges(outgoingEdges.get(current.nodeId) ?? []);
    for (const edge of sortedOutgoing) {
      const nextInbound = (remainingInbound.get(edge.to) ?? 0) - 1;
      remainingInbound.set(edge.to, nextInbound);
      if (nextInbound === 0) {
        queue.push({
          nodeId: edge.to,
          sourceOrder: topologicalOrder.length,
          edgePriority: edge.priority,
          edgeId: edge.id,
        });
      }
    }
  }

  if (topologicalOrder.length !== nodesById.size) {
    return {
      valid: false,
      issues: [
        {
          code: 'workflow_cycle_detected',
          message: 'Workflow definition contains a cycle',
          evidenceRefs: [`workflow_definition_id=${definition.id}`],
        },
      ],
    };
  }

  return { valid: true, topologicalOrder };
}
