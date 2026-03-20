/**
 * Declarative workflow node type registry for Nous-OSS.
 *
 * Phase 15.5 — Declarative Workflow Specification v1.
 *
 * Defines the `nous.*` namespaced node types and per-type parameter schemas
 * for the visual workflow builder / runtime spec format.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Node categories
// ---------------------------------------------------------------------------

export const NousNodeCategorySchema = z.enum([
  'trigger',
  'agent',
  'condition',
  'app',
  'tool',
  'memory',
  'governance',
]);
export type NousNodeCategory = z.infer<typeof NousNodeCategorySchema>;

// ---------------------------------------------------------------------------
// Namespace prefix mapping
// ---------------------------------------------------------------------------

export const NousNodeTypePrefix = {
  trigger: 'nous.trigger',
  agent: 'nous.agent',
  condition: 'nous.condition',
  app: 'nous.app',
  tool: 'nous.tool',
  memory: 'nous.memory',
  governance: 'nous.governance',
} as const satisfies Record<NousNodeCategory, string>;

// ---------------------------------------------------------------------------
// Node type string — must match `nous.<category>.<action>`
// ---------------------------------------------------------------------------

/**
 * Validates that a node type string matches the `nous.<category>.<action>`
 * pattern. The category segment must be one of the known categories.
 */
export const NousNodeTypeSchema = z
  .string()
  .regex(
    /^nous\.(trigger|agent|condition|app|tool|memory|governance)\..+$/,
    'Node type must match nous.<category>.<action> pattern',
  );
export type NousNodeType = z.infer<typeof NousNodeTypeSchema>;

// ---------------------------------------------------------------------------
// Per-type parameter schemas for well-known node types
// ---------------------------------------------------------------------------

/** nous.trigger.schedule */
export const TriggerScheduleParamsSchema = z.object({
  cron: z.string().min(1),
  timezone: z.string().optional(),
});
export type TriggerScheduleParams = z.infer<typeof TriggerScheduleParamsSchema>;

/** nous.trigger.webhook */
export const TriggerWebhookParamsSchema = z.object({
  path: z.string().min(1),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('POST'),
});
export type TriggerWebhookParams = z.infer<typeof TriggerWebhookParamsSchema>;

/** nous.agent.claude */
export const AgentClaudeParamsSchema = z.object({
  model: z.string().optional(),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
});
export type AgentClaudeParams = z.infer<typeof AgentClaudeParamsSchema>;

/** nous.agent.codex */
export const AgentCodexParamsSchema = z.object({
  model: z.string().optional(),
  instructions: z.string().optional(),
});
export type AgentCodexParams = z.infer<typeof AgentCodexParamsSchema>;

/** nous.condition.if */
export const ConditionIfParamsSchema = z.object({
  expression: z.string().min(1),
});
export type ConditionIfParams = z.infer<typeof ConditionIfParamsSchema>;

/** nous.condition.switch */
export const ConditionSwitchParamsSchema = z.object({
  expression: z.string().min(1),
  cases: z.record(z.string(), z.unknown()).optional(),
});
export type ConditionSwitchParams = z.infer<typeof ConditionSwitchParamsSchema>;

/** nous.condition.governance-gate */
export const ConditionGovernanceGateParamsSchema = z.object({
  level: z.enum(['must', 'should', 'may']),
});
export type ConditionGovernanceGateParams = z.infer<
  typeof ConditionGovernanceGateParamsSchema
>;

/** nous.memory.read */
export const MemoryReadParamsSchema = z.object({
  key: z.string().min(1),
  scope: z.enum(['global', 'project']).optional(),
});
export type MemoryReadParams = z.infer<typeof MemoryReadParamsSchema>;

/** nous.memory.write */
export const MemoryWriteParamsSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  scope: z.enum(['global', 'project']).optional(),
});
export type MemoryWriteParams = z.infer<typeof MemoryWriteParamsSchema>;

/** nous.memory.search */
export const MemorySearchParamsSchema = z.object({
  query: z.string().min(1),
  limit: z.number().positive().optional(),
  scope: z.enum(['global', 'project']).optional(),
});
export type MemorySearchParams = z.infer<typeof MemorySearchParamsSchema>;

/** nous.governance.pfc-gate */
export const GovernancePfcGateParamsSchema = z.object({
  tier: z.number().int().min(0).max(5),
  action: z.enum(['block', 'escalate', 'allow']).optional(),
});
export type GovernancePfcGateParams = z.infer<typeof GovernancePfcGateParamsSchema>;

/** nous.governance.witness-checkpoint */
export const GovernanceWitnessCheckpointParamsSchema = z.object({
  label: z.string().min(1).optional(),
});
export type GovernanceWitnessCheckpointParams = z.infer<
  typeof GovernanceWitnessCheckpointParamsSchema
>;

/** nous.governance.escalation */
export const GovernanceEscalationParamsSchema = z.object({
  channel: z.string().min(1),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  message: z.string().optional(),
});
export type GovernanceEscalationParams = z.infer<
  typeof GovernanceEscalationParamsSchema
>;

// ---------------------------------------------------------------------------
// Registry: known node type -> parameter schema
// ---------------------------------------------------------------------------

/**
 * Map from well-known node type strings to their parameter schemas.
 * Types not in this registry accept `Record<string, unknown>` parameters.
 */
export const NODE_TYPE_PARAMETER_SCHEMAS: Record<string, z.ZodType> = {
  'nous.trigger.schedule': TriggerScheduleParamsSchema,
  'nous.trigger.webhook': TriggerWebhookParamsSchema,
  'nous.agent.claude': AgentClaudeParamsSchema,
  'nous.agent.codex': AgentCodexParamsSchema,
  'nous.condition.if': ConditionIfParamsSchema,
  'nous.condition.switch': ConditionSwitchParamsSchema,
  'nous.condition.governance-gate': ConditionGovernanceGateParamsSchema,
  'nous.memory.read': MemoryReadParamsSchema,
  'nous.memory.write': MemoryWriteParamsSchema,
  'nous.memory.search': MemorySearchParamsSchema,
  'nous.governance.pfc-gate': GovernancePfcGateParamsSchema,
  'nous.governance.witness-checkpoint': GovernanceWitnessCheckpointParamsSchema,
  'nous.governance.escalation': GovernanceEscalationParamsSchema,
};

/**
 * Resolve the parameter schema for a given node type.
 * Falls back to `z.record(z.string(), z.unknown())` for unknown types.
 */
export function resolveNodeTypeParameterSchema(
  nodeType: string,
): z.ZodType {
  return NODE_TYPE_PARAMETER_SCHEMAS[nodeType] ?? z.record(z.string(), z.unknown());
}

/**
 * Extract the category segment from a `nous.<category>.<action>` type string.
 * Returns `undefined` for malformed types.
 */
export function extractNodeCategory(
  nodeType: string,
): NousNodeCategory | undefined {
  const match = nodeType.match(
    /^nous\.(trigger|agent|condition|app|tool|memory|governance)\./,
  );
  if (!match?.[1]) return undefined;
  return match[1] as NousNodeCategory;
}
