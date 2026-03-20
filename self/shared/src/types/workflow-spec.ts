/**
 * Declarative workflow specification schemas for Nous-OSS.
 *
 * Phase 15.5 — Declarative Workflow Specification v1.
 *
 * These schemas define the format that the visual workflow builder serializes
 * to (YAML primary, JSON stub) and that the runtime adapter converts from.
 *
 * This is a **separate** schema layer from the runtime `WorkflowDefinition`
 * in `workflow.ts`. The runtime adapter bridges between the two.
 */
import { z } from 'zod';
import { NousNodeTypeSchema } from './workflow-node-types.js';

// ---------------------------------------------------------------------------
// WorkflowNode — a single node in the declarative spec
// ---------------------------------------------------------------------------

export const WorkflowNodeSchema = z.object({
  /** Short identifier — unique within the workflow. */
  id: z.string().min(1),

  /** Human-readable display name. */
  name: z.string().min(1),

  /** Node type in `nous.<category>.<action>` format. */
  type: NousNodeTypeSchema,

  /** Canvas position `[x, y]` — used by the builder, ignored by runtime. */
  position: z.tuple([z.number(), z.number()]),

  /** Type-specific parameters. */
  parameters: z.record(z.string(), z.unknown()).default({}),
});
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;

// ---------------------------------------------------------------------------
// WorkflowConnection — a directed edge between two nodes
// ---------------------------------------------------------------------------

export const WorkflowConnectionSchema = z.object({
  /** Source node ID. */
  from: z.string().min(1),

  /** Target node ID. */
  to: z.string().min(1),

  /** Optional conditional branch output (true/false for if-nodes, string for switch). */
  output: z.union([z.boolean(), z.string()]).optional(),
});
export type WorkflowConnection = z.infer<typeof WorkflowConnectionSchema>;

// ---------------------------------------------------------------------------
// WorkflowSpec — the top-level declarative workflow definition
// ---------------------------------------------------------------------------

export const WorkflowSpecSchema = z.object({
  /** Workflow display name. */
  name: z.string().min(1),

  /** Schema version — currently always 1. */
  version: z.literal(1),

  /** Ordered list of nodes. */
  nodes: z.array(WorkflowNodeSchema).min(1),

  /** Ordered list of connections. */
  connections: z.array(WorkflowConnectionSchema).default([]),
});
export type WorkflowSpec = z.infer<typeof WorkflowSpecSchema>;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

export interface WorkflowSpecValidationError {
  path: string;
  message: string;
}

/**
 * Validate a `WorkflowSpec` and return structured errors.
 *
 * Performs both Zod schema validation and structural checks:
 * - Duplicate node IDs
 * - Connections referencing non-existent nodes
 * - Self-loop connections
 */
export function validateWorkflowSpec(
  input: unknown,
): { success: true; data: WorkflowSpec } | { success: false; errors: WorkflowSpecValidationError[] } {
  const result = WorkflowSpecSchema.safeParse(input);

  if (!result.success) {
    const errors: WorkflowSpecValidationError[] = result.error.issues.map(
      (issue) => ({
        path: issue.path.length > 0 ? issue.path.join('.') : 'root',
        message: issue.message,
      }),
    );
    return { success: false, errors };
  }

  const spec = result.data;
  const structuralErrors: WorkflowSpecValidationError[] = [];
  const nodeIds = new Set<string>();

  // Check duplicate node IDs
  for (let i = 0; i < spec.nodes.length; i++) {
    const node = spec.nodes[i]!;
    if (nodeIds.has(node.id)) {
      structuralErrors.push({
        path: `nodes.${i}.id`,
        message: `Duplicate node id: ${node.id}`,
      });
    }
    nodeIds.add(node.id);
  }

  // Check connections reference valid nodes
  for (let i = 0; i < spec.connections.length; i++) {
    const conn = spec.connections[i]!;

    if (!nodeIds.has(conn.from)) {
      structuralErrors.push({
        path: `connections.${i}.from`,
        message: `Connection references non-existent source node: ${conn.from}`,
      });
    }

    if (!nodeIds.has(conn.to)) {
      structuralErrors.push({
        path: `connections.${i}.to`,
        message: `Connection references non-existent target node: ${conn.to}`,
      });
    }

    if (conn.from === conn.to) {
      structuralErrors.push({
        path: `connections.${i}`,
        message: `Self-loop connection: ${conn.from} -> ${conn.to}`,
      });
    }
  }

  if (structuralErrors.length > 0) {
    return { success: false, errors: structuralErrors };
  }

  return { success: true, data: spec };
}
