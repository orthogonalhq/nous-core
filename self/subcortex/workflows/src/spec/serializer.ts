/**
 * YAML serializer for declarative workflow specifications.
 *
 * Serializes a `WorkflowSpec` into a human-readable, git-diffable YAML string.
 */
import YAML from 'yaml';
import type { WorkflowSpec } from '@nous/shared';

export interface SerializeWorkflowSpecOptions {
  /** Indentation width. Default: 2. */
  indent?: number;
}

/**
 * Serialize a `WorkflowSpec` to a YAML string.
 *
 * The output uses block-style mappings for readability, with inline
 * `[x, y]` position tuples preserved via flow-style sequences on
 * short arrays.
 */
export function serializeWorkflowSpec(
  spec: WorkflowSpec,
  options?: SerializeWorkflowSpecOptions,
): string {
  const indent = options?.indent ?? 2;

  // Build a plain object to control serialization order
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
      };
      if (conn.output !== undefined) {
        entry.output = conn.output;
      }
      return entry;
    }),
  };

  return YAML.stringify(doc, {
    indent,
    lineWidth: 0, // disable line wrapping for readability
  });
}
