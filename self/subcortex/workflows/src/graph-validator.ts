import type {
  WorkflowDefinition,
  WorkflowEdgeDefinition,
  WorkflowNodeDefinition,
  WorkflowNodeDefinitionId,
} from '@nous/shared';
import { WorkflowDefinitionSchema } from '@nous/shared';

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

function isResolvableSchemaRef(ref: string): boolean {
  return ref.startsWith('schema://');
}

function resolveNodeIoContract(node: WorkflowNodeDefinition): {
  inputSchemaRef?: string;
  outputSchemaRef?: string;
} {
  return {
    inputSchemaRef: node.inputSchemaRef,
    outputSchemaRef:
      node.outputSchemaRef ??
      (node.config.type === 'model-call'
        ? node.config.outputSchemaRef
        : node.config.type === 'tool-execution'
          ? node.config.resultSchemaRef
          : undefined),
  };
}

export function validateWorkflowDefinition(
  definition: WorkflowDefinition,
): WorkflowValidationResult {
  const issues: WorkflowValidationIssue[] = [];
  const parsedDefinition = WorkflowDefinitionSchema.safeParse(definition);
  if (!parsedDefinition.success) {
    for (const issue of parsedDefinition.error.issues) {
      pushIssue(
        issues,
        'workflow_definition_schema_invalid',
        issue.message,
        `path=${issue.path.length > 0 ? issue.path.join('.') : 'root'}`,
      );
    }
    return { valid: false, issues };
  }

  const normalizedDefinition = parsedDefinition.data;
  const nodesById = new Map<WorkflowNodeDefinitionId, WorkflowDefinition['nodes'][number]>();
  const edgeIds = new Set<string>();
  const incomingCount = new Map<WorkflowNodeDefinitionId, number>();
  const outgoingEdges = new Map<WorkflowNodeDefinitionId, WorkflowEdgeDefinition[]>();

  for (const node of normalizedDefinition.nodes) {
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

  for (const edge of normalizedDefinition.edges) {
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

  const entryNodeIdSet = new Set(normalizedDefinition.entryNodeIds);
  for (const entryNodeId of normalizedDefinition.entryNodeIds) {
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
  const stack = [...normalizedDefinition.entryNodeIds];
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

  for (const node of normalizedDefinition.nodes) {
    const ioContract = resolveNodeIoContract(node);
    const outbound = sortEdges(outgoingEdges.get(node.id) ?? []);
    const outboundBranchEdges = outbound.filter((edge) => edge.branchKey != null);

    if (ioContract.inputSchemaRef && !isResolvableSchemaRef(ioContract.inputSchemaRef)) {
      pushIssue(
        issues,
        'workflow_schema_ref_unresolvable',
        `Node ${node.id} declares an unresolvable input schema ref ${ioContract.inputSchemaRef}`,
        `node_id=${node.id}`,
        `input_schema_ref=${ioContract.inputSchemaRef}`,
      );
    }

    if (ioContract.outputSchemaRef && !isResolvableSchemaRef(ioContract.outputSchemaRef)) {
      pushIssue(
        issues,
        'workflow_schema_ref_unresolvable',
        `Node ${node.id} declares an unresolvable output schema ref ${ioContract.outputSchemaRef}`,
        `node_id=${node.id}`,
        `output_schema_ref=${ioContract.outputSchemaRef}`,
      );
    }

    if (
      (node.type === 'model-call' || node.type === 'tool-execution') &&
      !ioContract.outputSchemaRef
    ) {
      pushIssue(
        issues,
        'workflow_node_output_schema_missing',
        `Gateway-managed node ${node.id} must declare an output schema ref`,
        `node_id=${node.id}`,
      );
    }

    if (node.type === 'condition') {
      if (node.config.type !== 'condition') {
        pushIssue(
          issues,
          'workflow_condition_config_type_mismatch',
          `Condition node ${node.id} must carry a condition config`,
          `node_id=${node.id}`,
        );
        continue;
      }

      const expectedBranchKeys = new Set([
        node.config.trueBranchKey,
        node.config.falseBranchKey,
      ]);

      for (const edge of outbound) {
        if (!edge.branchKey) {
          pushIssue(
            issues,
            'workflow_condition_edge_missing_branch_key',
            `Condition node ${node.id} has an outbound edge without a branch key`,
            `node_id=${node.id}`,
            `edge_id=${edge.id}`,
          );
        }
      }

      for (const edge of outboundBranchEdges) {
        if (!expectedBranchKeys.has(edge.branchKey as string)) {
          pushIssue(
            issues,
            'workflow_condition_branch_key_unexpected',
            `Condition node ${node.id} has an outbound edge for unexpected branch key ${edge.branchKey}`,
            `node_id=${node.id}`,
            `edge_id=${edge.id}`,
            `branch_key=${edge.branchKey}`,
          );
        }
      }

      for (const branchKey of expectedBranchKeys) {
        if (!outboundBranchEdges.some((edge) => edge.branchKey === branchKey)) {
          pushIssue(
            issues,
            'workflow_condition_branch_key_missing',
            `Condition node ${node.id} is missing an outbound edge for branch key ${branchKey}`,
            `node_id=${node.id}`,
            `branch_key=${branchKey}`,
          );
        }
      }

      continue;
    }

    if (outboundBranchEdges.length > 0) {
      for (const edge of outboundBranchEdges) {
        pushIssue(
          issues,
          'workflow_branch_key_requires_condition_node',
          `Node ${node.id} cannot declare branched outbound edges because it is not a condition node`,
          `node_id=${node.id}`,
          `edge_id=${edge.id}`,
          `branch_key=${edge.branchKey}`,
        );
      }
    }

    for (const edge of outbound) {
      const targetNode = nodesById.get(edge.to);
      if (!targetNode) {
        continue;
      }

      const sourceIo = resolveNodeIoContract(node);
      const targetIo = resolveNodeIoContract(targetNode);
      if (
        sourceIo.outputSchemaRef &&
        targetIo.inputSchemaRef &&
        sourceIo.outputSchemaRef !== targetIo.inputSchemaRef
      ) {
        pushIssue(
          issues,
          'workflow_edge_schema_incompatible',
          `Edge ${edge.id} connects incompatible node schemas (${sourceIo.outputSchemaRef} -> ${targetIo.inputSchemaRef})`,
          `edge_id=${edge.id}`,
          `from=${node.id}`,
          `to=${targetNode.id}`,
        );
      }
    }
  }

  if (issues.length > 0) {
    return { valid: false, issues };
  }

  const queue: QueueItem[] = [...normalizedDefinition.entryNodeIds]
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
          evidenceRefs: [`workflow_definition_id=${normalizedDefinition.id}`],
        },
      ],
    };
  }

  return { valid: true, topologicalOrder };
}
