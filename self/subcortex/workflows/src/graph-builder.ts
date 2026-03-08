import { createHash } from 'node:crypto';
import {
  DerivedWorkflowGraphSchema,
  type DerivedWorkflowGraph,
  type WorkflowDefinition,
  type WorkflowEdgeDefinition,
} from '@nous/shared';
import { validateWorkflowDefinition } from './graph-validator.js';

const sortEdges = (
  edges: WorkflowEdgeDefinition[],
): WorkflowEdgeDefinition[] =>
  [...edges].sort(
    (left, right) =>
      left.priority - right.priority ||
      left.id.localeCompare(right.id) ||
      left.to.localeCompare(right.to),
  );

const normalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = normalize((value as Record<string, unknown>)[key]);
        return result;
      }, {});
  }
  return value;
};

export function buildGraphDigest(definition: WorkflowDefinition): string {
  const normalizedDefinition = {
    id: definition.id,
    projectId: definition.projectId,
    mode: definition.mode,
    version: definition.version,
    name: definition.name,
    entryNodeIds: [...definition.entryNodeIds].sort((left, right) =>
      left.localeCompare(right),
    ),
    nodes: [...definition.nodes]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((node) => normalize(node)),
    edges: sortEdges(definition.edges).map((edge) => normalize(edge)),
  };

  return createHash('sha256')
    .update(JSON.stringify(normalizedDefinition))
    .digest('hex');
}

export function buildDerivedWorkflowGraph(
  definition: WorkflowDefinition,
): DerivedWorkflowGraph {
  const validation = validateWorkflowDefinition(definition);
  if (!validation.valid) {
    throw new Error(
      validation.issues.map((issue) => issue.message).join('; '),
    );
  }

  const topologicalOrder = validation.topologicalOrder;
  const topologicalIndex = new Map(
    topologicalOrder.map((nodeId, index) => [nodeId, index]),
  );
  const edges = sortEdges(definition.edges);
  const nodes = Object.fromEntries(
    definition.nodes.map((node) => {
      const inboundEdgeIds = edges
        .filter((edge) => edge.to === node.id)
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((edge) => edge.id);
      const outboundEdgeIds = edges
        .filter((edge) => edge.from === node.id)
        .map((edge) => edge.id);

      return [
        node.id,
        {
          definition: node,
          inboundEdgeIds,
          outboundEdgeIds,
          topologicalIndex: topologicalIndex.get(node.id) ?? 0,
        },
      ];
    }),
  );

  const graph = DerivedWorkflowGraphSchema.parse({
    workflowDefinitionId: definition.id,
    projectId: definition.projectId,
    version: definition.version,
    graphDigest: buildGraphDigest(definition),
    entryNodeIds: [...definition.entryNodeIds].sort((left, right) =>
      left.localeCompare(right),
    ),
    topologicalOrder,
    nodes,
    edges: Object.fromEntries(edges.map((edge) => [edge.id, edge])),
  });

  return graph;
}
