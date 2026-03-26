/**
 * Bidirectional projection between WorkflowSpec and React Flow graph state.
 *
 * SP 2.2 — WorkflowSpec Sync.
 *
 * Inbound: WorkflowSpec -> builder nodes/edges
 * Outbound: builder nodes/edges -> WorkflowSpec
 *
 * Uses full reserialization strategy per SDS risk mitigation.
 * Incremental sync deferred until profiling demonstrates need.
 *
 * NOTE: parseWorkflowSpec and serializeWorkflowSpec are implemented locally
 * as adapter functions matching the @nous/workflows API signatures. This avoids
 * adding @nous/subcortex-workflows as a dependency of @nous/ui, which would
 * create an undesirable cross-layer coupling. The upstream functions in
 * @nous/workflows are the canonical implementations; these adapters replicate
 * the same YAML parse/stringify + validation behavior.
 */
import YAML from 'yaml'
import {
  validateWorkflowSpec,
  type WorkflowSpec,
  type WorkflowSpecValidationError,
} from '@nous/shared'
import type {
  WorkflowBuilderNode,
  WorkflowBuilderEdge,
  WorkflowBuilderNodeData,
  WorkflowBuilderEdgeData,
  NodeCategory,
} from '../../../types/workflow-builder'

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Node data keys reserved for builder-internal use.
 * These are NOT serialized to spec parameters on outbound projection.
 */
export const RESERVED_NODE_DATA_KEYS = new Set([
  'label',
  'category',
  'description',
  'nousType',
])

// ─── Local parse/serialize adapters ─────────────────────────────────────────

type ParseResult =
  | { success: true; data: WorkflowSpec }
  | { success: false; errors: WorkflowSpecValidationError[] }

/**
 * Parse a YAML string into a validated WorkflowSpec.
 * Local adapter matching @nous/workflows parseWorkflowSpec signature.
 */
function parseWorkflowSpecYaml(yamlString: string): ParseResult {
  let parsed: unknown
  try {
    parsed = YAML.parse(yamlString)
  } catch (error) {
    return {
      success: false,
      errors: [
        {
          path: 'root',
          message: `YAML parse error: ${(error as Error).message}`,
        },
      ],
    }
  }

  return validateWorkflowSpec(parsed)
}

/**
 * Serialize a WorkflowSpec to a YAML string.
 * Local adapter matching @nous/workflows serializeWorkflowSpec signature.
 */
function serializeWorkflowSpecYaml(spec: WorkflowSpec): string {
  const doc: Record<string, unknown> = {
    name: spec.name,
    version: spec.version,
    nodes: spec.nodes.map((node) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      position: node.position,
      ...(Object.keys(node.parameters).length > 0
        ? { parameters: node.parameters }
        : {}),
    })),
    connections: spec.connections.map((conn) => {
      const entry: Record<string, unknown> = {
        from: conn.from,
        to: conn.to,
      }
      if (conn.output !== undefined) {
        entry.output = conn.output
      }
      return entry
    }),
  }

  return YAML.stringify(doc, {
    indent: 2,
    lineWidth: 0,
  })
}

// ─── Projection helpers ─────────────────────────────────────────────────────

/**
 * Extract category from a nous.<category>.<action> type string.
 */
function extractCategory(nousType: string): NodeCategory {
  const segments = nousType.split('.')
  return (segments[1] ?? 'tool') as NodeCategory
}

// ─── Return type ────────────────────────────────────────────────────────────

export interface UseWorkflowSyncReturn {
  /** Load a WorkflowSpec from YAML into builder graph arrays. */
  loadSpec: (yamlString: string) => {
    success: boolean
    errors?: WorkflowSpecValidationError[]
    nodes?: WorkflowBuilderNode[]
    edges?: WorkflowBuilderEdge[]
    spec?: WorkflowSpec
  }

  /** Serialize current builder state to WorkflowSpec (outbound projection). */
  serializeCurrentState: (
    nodes: WorkflowBuilderNode[],
    edges: WorkflowBuilderEdge[],
    specMeta: { name: string; version: number },
  ) => {
    spec: WorkflowSpec
    yaml: string
    validationErrors: WorkflowSpecValidationError[]
  }

  /** Project a validated WorkflowSpec into builder graph arrays. */
  projectInbound: (spec: WorkflowSpec) => {
    nodes: WorkflowBuilderNode[]
    edges: WorkflowBuilderEdge[]
  }

  /** Project builder graph arrays into a WorkflowSpec object. */
  projectOutbound: (
    nodes: WorkflowBuilderNode[],
    edges: WorkflowBuilderEdge[],
    specMeta: { name: string; version: number },
  ) => WorkflowSpec
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Bidirectional projection hook for WorkflowSpec <-> React Flow graph.
 *
 * Pure functions — no internal state. All projection functions are
 * referentially transparent and can be called outside React render.
 */
export function useWorkflowSync(): UseWorkflowSyncReturn {
  /**
   * Inbound projection: WorkflowSpec -> React Flow nodes/edges.
   */
  const projectInbound = (spec: WorkflowSpec): {
    nodes: WorkflowBuilderNode[]
    edges: WorkflowBuilderEdge[]
  } => {
    const nodes: WorkflowBuilderNode[] = spec.nodes.map((specNode) => {
      // Spread parameters into node data (excluding reserved keys)
      const extraData: Record<string, unknown> = {}
      if (specNode.parameters) {
        for (const [key, value] of Object.entries(specNode.parameters)) {
          if (!RESERVED_NODE_DATA_KEYS.has(key)) {
            extraData[key] = value
          }
        }
      }

      const data: WorkflowBuilderNodeData = {
        label: specNode.name,
        category: extractCategory(specNode.type),
        nousType: specNode.type,
        ...extraData,
      }

      return {
        id: specNode.id,
        type: 'builderNode',
        position: {
          x: specNode.position[0],
          y: specNode.position[1],
        },
        data,
      }
    })

    const edges: WorkflowBuilderEdge[] = spec.connections.map((conn) => {
      let label: string | undefined
      if (conn.output !== undefined) {
        label = String(conn.output)
      }

      const edgeData: WorkflowBuilderEdgeData = {
        edgeType: 'execution',
        ...(label !== undefined ? { label } : {}),
      }

      return {
        id: `edge-${conn.from}-${conn.to}`,
        source: conn.from,
        target: conn.to,
        type: 'execution',
        data: edgeData,
      }
    })

    return { nodes, edges }
  }

  /**
   * Outbound projection: React Flow nodes/edges -> WorkflowSpec.
   */
  const projectOutbound = (
    nodes: WorkflowBuilderNode[],
    edges: WorkflowBuilderEdge[],
    specMeta: { name: string; version: number },
  ): WorkflowSpec => {
    const specNodes = nodes.map((node) => {
      // Collect non-reserved data keys as parameters
      const parameters: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(node.data)) {
        if (!RESERVED_NODE_DATA_KEYS.has(key)) {
          parameters[key] = value
        }
      }

      return {
        id: node.id,
        name: node.data.label,
        type: node.data.nousType,
        position: [node.position.x, node.position.y] as [number, number],
        parameters,
      }
    })

    const specConnections = edges.map((edge) => {
      const conn: { from: string; to: string; output?: boolean | string } = {
        from: edge.source,
        to: edge.target,
      }

      if (edge.data?.label !== undefined) {
        // Parse label back to typed output
        if (edge.data.label === 'true') {
          conn.output = true
        } else if (edge.data.label === 'false') {
          conn.output = false
        } else {
          conn.output = edge.data.label
        }
      }

      return conn
    })

    return {
      name: specMeta.name,
      version: specMeta.version,
      nodes: specNodes,
      connections: specConnections,
    }
  }

  /**
   * Load a YAML string: parse -> validate -> project inbound.
   */
  const loadSpec = (yamlString: string) => {
    const result = parseWorkflowSpecYaml(yamlString)

    if (!result.success) {
      return {
        success: false as const,
        errors: result.errors,
      }
    }

    const { nodes, edges } = projectInbound(result.data)
    return {
      success: true as const,
      nodes,
      edges,
      spec: result.data,
    }
  }

  /**
   * Serialize current state: project outbound -> YAML -> validate.
   */
  const serializeCurrentState = (
    nodes: WorkflowBuilderNode[],
    edges: WorkflowBuilderEdge[],
    specMeta: { name: string; version: number },
  ) => {
    const spec = projectOutbound(nodes, edges, specMeta)
    const yaml = serializeWorkflowSpecYaml(spec)

    // Validate the produced spec
    const validationResult = validateWorkflowSpec(spec)
    const validationErrors: WorkflowSpecValidationError[] =
      validationResult.success ? [] : validationResult.errors

    return {
      spec,
      yaml,
      validationErrors,
    }
  }

  return {
    loadSpec,
    serializeCurrentState,
    projectInbound,
    projectOutbound,
  }
}
