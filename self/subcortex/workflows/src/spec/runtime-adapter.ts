/**
 * Runtime adapter — bridges the declarative WorkflowSpec to the existing
 * WorkflowDefinition / DerivedWorkflowGraph execution model.
 *
 * The declarative spec uses `nous.<category>.<action>` node types and a
 * flat `connections[]` array. The runtime uses `WorkflowNodeDefinition`
 * with typed config discriminated unions, UUID-branded IDs, and
 * `WorkflowEdgeDefinition` with branchKey for conditional routing.
 */
import { randomUUID } from 'node:crypto';
import type {
  WorkflowSpec,
  WorkflowNode,
  WorkflowConnection,
  WorkflowDefinition,
  WorkflowNodeDefinition,
  WorkflowEdgeDefinition,
  WorkflowNodeConfig,
  DerivedWorkflowGraph,
  WorkflowDefinitionId,
  WorkflowNodeDefinitionId,
  WorkflowEdgeId,
  ProjectId,
  WorkflowNodeKind,
  WorkflowNodeDispatchMapping,
} from '@nous/shared';
import { WORKFLOW_NODE_DISPATCH_MAP } from '@nous/shared';
import { extractNodeCategory } from '@nous/shared';
import { buildDerivedWorkflowGraph } from '../graph-builder.js';

// ---------------------------------------------------------------------------
// Conversion options
// ---------------------------------------------------------------------------

export interface NodeEnrichmentData {
  /** Named skill reference declared by the node package content. */
  skill?: string;

  /** Contract bindings declared by the node package content. */
  contracts?: string[];

  /** Template bindings declared by the node package content. */
  templates?: string[];

  /** Raw markdown body loaded from node.md. */
  body?: string;
}

export interface SpecToDefinitionOptions {
  /** UUID for the workflow definition. Auto-generated if omitted. */
  definitionId?: string;

  /** Project ID to bind the definition to. Required by the runtime schema. */
  projectId: string;

  /** Definition mode. Defaults to 'protocol'. */
  mode?: 'protocol' | 'hybrid';

  /** Optional package-loader enrichment keyed by declarative node id. */
  enrichment?: Record<string, NodeEnrichmentData>;
}

// ---------------------------------------------------------------------------
// Node type -> runtime config mapping
// ---------------------------------------------------------------------------

/**
 * Map a declarative spec node to a runtime `WorkflowNodeConfig`.
 *
 * The runtime discriminated union expects one of: model-call,
 * tool-execution, condition, transform, quality-gate, human-decision,
 * subworkflow. We map spec categories to the closest runtime equivalent.
 */
function mapNodeTypeToConfig(node: WorkflowNode): WorkflowNodeConfig {
  const category = extractNodeCategory(node.type);

  switch (category) {
    case 'agent':
      // Agent nodes map to model-call configs
      return {
        type: 'model-call' as const,
        modelRole: 'orchestrator' as const,
        promptRef: node.parameters.systemPrompt
          ? `inline:${node.id}`
          : `default:${node.type}`,
        outputSchemaRef: `schema://${node.id}/output`,
      };

    case 'condition':
      // Condition nodes map to condition configs
      return {
        type: 'condition' as const,
        predicateRef: node.parameters.expression
          ? `inline:${node.id}`
          : `default:${node.type}`,
        trueBranchKey: 'true',
        falseBranchKey: 'false',
      };

    case 'tool':
      // MCP tool nodes map to tool-execution configs
      return {
        type: 'tool-execution' as const,
        toolName: node.type.replace('nous.tool.', ''),
        inputMappingRef: `inline:${node.id}`,
        resultSchemaRef: `schema://${node.id}/output`,
      };

    case 'memory':
      // Memory operations map to tool-execution configs
      return {
        type: 'tool-execution' as const,
        toolName: `memory.${node.type.replace('nous.memory.', '')}`,
        inputMappingRef: `inline:${node.id}`,
        resultSchemaRef: `schema://${node.id}/output`,
      };

    case 'governance':
      // Governance gates map to quality-gate configs
      return {
        type: 'quality-gate' as const,
        evaluatorRef: `governance:${node.type.replace('nous.governance.', '')}`,
        passThresholdRef: `threshold:${node.id}`,
        failureAction: 'block' as const,
      };

    case 'trigger':
      // Triggers map to transform configs (they produce initial data)
      return {
        type: 'transform' as const,
        transformRef: `trigger:${node.type.replace('nous.trigger.', '')}`,
        inputMappingRef: `inline:${node.id}`,
      };

    case 'app':
      // App actions map to tool-execution configs
      return {
        type: 'tool-execution' as const,
        toolName: `app.${node.type.replace('nous.app.', '')}`,
        inputMappingRef: `inline:${node.id}`,
        resultSchemaRef: `schema://${node.id}/output`,
      };

    default:
      // Unknown categories default to transform
      return {
        type: 'transform' as const,
        transformRef: `unknown:${node.type}`,
        inputMappingRef: `inline:${node.id}`,
      };
  }
}

/**
 * Map the declarative spec node category to a runtime NodeType.
 */
function mapNodeTypeToRuntimeType(
  node: WorkflowNode,
): WorkflowNodeDefinition['type'] {
  const category = extractNodeCategory(node.type);
  switch (category) {
    case 'agent':
      return 'model-call';
    case 'condition':
      return 'condition';
    case 'tool':
    case 'memory':
    case 'app':
      return 'tool-execution';
    case 'governance':
      return 'quality-gate';
    case 'trigger':
    default:
      return 'transform';
  }
}

// ---------------------------------------------------------------------------
// Connection -> Edge mapping
// ---------------------------------------------------------------------------

/**
 * Convert a declarative `WorkflowConnection` to a runtime
 * `WorkflowEdgeDefinition`. Handles conditional `output` fields by mapping
 * them to `branchKey`.
 */
function mapConnectionToEdge(
  connection: WorkflowConnection,
  nodeIdMap: Map<string, string>,
): WorkflowEdgeDefinition {
  const fromUuid = nodeIdMap.get(connection.from);
  const toUuid = nodeIdMap.get(connection.to);

  if (!fromUuid || !toUuid) {
    throw new Error(
      `Connection references unknown node ID: from=${connection.from}, to=${connection.to}`,
    );
  }

  const edge: WorkflowEdgeDefinition = {
    id: randomUUID() as WorkflowEdgeId,
    from: fromUuid as WorkflowNodeDefinitionId,
    to: toUuid as WorkflowNodeDefinitionId,
    priority: 0,
  };

  if (connection.output !== undefined) {
    edge.branchKey = String(connection.output);
  }

  return edge;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert a declarative `WorkflowSpec` to a runtime `WorkflowDefinition`.
 *
 * The conversion:
 * 1. Assigns UUID IDs to nodes (the spec uses short string IDs)
 * 2. Maps `nous.*` node types to runtime config discriminated unions
 * 3. Converts flat `connections[]` to `WorkflowEdgeDefinition[]` with branchKey
 * 4. Identifies entry nodes (nodes with no incoming connections)
 */
export function specToWorkflowDefinition(
  spec: WorkflowSpec,
  options: SpecToDefinitionOptions,
): WorkflowDefinition {
  const definitionId = (options.definitionId ?? randomUUID()) as WorkflowDefinitionId;
  const projectId = options.projectId as ProjectId;

  // Build a map from spec short-id -> runtime UUID
  const nodeIdMap = new Map<string, string>();
  for (const node of spec.nodes) {
    nodeIdMap.set(node.id, randomUUID());
  }

  // Find entry nodes: nodes with no incoming connections
  const targetNodeIds = new Set(spec.connections.map((c) => c.to));
  const entryNodeSpecIds = spec.nodes
    .filter((node) => !targetNodeIds.has(node.id))
    .map((node) => node.id);

  if (entryNodeSpecIds.length === 0) {
    // If all nodes have incoming connections, use the first node
    entryNodeSpecIds.push(spec.nodes[0]!.id);
  }

  // Convert nodes
  const nodes: WorkflowNodeDefinition[] = spec.nodes.map((node) => {
    const nodeUuid = nodeIdMap.get(node.id)!;
    const runtimeType = mapNodeTypeToRuntimeType(node);
    const config = mapNodeTypeToConfig(node);
    const nodeEnrichment = options.enrichment?.[node.id];

    return {
      id: nodeUuid as WorkflowNodeDefinitionId,
      name: node.name,
      type: runtimeType,
      governance: 'should' as const,
      executionModel: 'synchronous' as const,
      config,
      ...(nodeEnrichment
        ? {
            metadata: {
              specNodeId: node.id,
              skill: nodeEnrichment.skill,
              contracts: nodeEnrichment.contracts,
              templates: nodeEnrichment.templates,
            },
          }
        : {}),
    };
  });

  // Convert connections
  const edges: WorkflowEdgeDefinition[] = spec.connections.map((conn) =>
    mapConnectionToEdge(conn, nodeIdMap),
  );

  return {
    id: definitionId,
    projectId,
    mode: options.mode ?? 'protocol',
    version: '1',
    name: spec.name,
    entryNodeIds: entryNodeSpecIds.map(
      (specId) => nodeIdMap.get(specId)! as WorkflowNodeDefinitionId,
    ),
    nodes,
    edges,
  };
}

/**
 * Convert a declarative `WorkflowSpec` directly to a `DerivedWorkflowGraph`,
 * ready for execution by the `DeterministicWorkflowEngine`.
 *
 * This is a convenience wrapper that calls `specToWorkflowDefinition` and
 * then `buildDerivedWorkflowGraph`.
 */
export function specToExecutionGraph(
  spec: WorkflowSpec,
  options: SpecToDefinitionOptions,
): DerivedWorkflowGraph {
  const definition = specToWorkflowDefinition(spec, options);
  return buildDerivedWorkflowGraph(definition);
}

/**
 * Returns the node ID mapping from spec short-IDs to runtime UUIDs.
 *
 * Useful for correlating declarative spec nodes with runtime graph nodes
 * after conversion.
 */
export function buildNodeIdMap(
  spec: WorkflowSpec,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const node of spec.nodes) {
    map.set(node.id, randomUUID());
  }
  return map;
}

// ---------------------------------------------------------------------------
// Dispatch target mapping
// ---------------------------------------------------------------------------

/**
 * Return the deterministic dispatch target for a workflow node kind.
 *
 * Uses the static WORKFLOW_NODE_DISPATCH_MAP. Returns fail-safe default
 * ({ executionMode: 'internal', agentClass: null }) for unrecognized kinds.
 */
export function mapNodeTypeToDispatchTarget(
  nodeKind: WorkflowNodeKind,
): WorkflowNodeDispatchMapping {
  return (
    WORKFLOW_NODE_DISPATCH_MAP[nodeKind] ??
    ({ executionMode: 'internal' as const, agentClass: null })
  );
}
