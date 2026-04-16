/**
 * Task definition and execution record types for Nous-OSS.
 *
 * WR-111 — Lightweight Task System.
 * Canonical source: task-definition-schema-v1.md, task-execution-storage-v1.md
 */
import { z } from 'zod';

// --- Trigger Config Schemas ---

export const ManualTriggerConfigSchema = z.object({
  type: z.literal('manual'),
});
export type ManualTriggerConfig = z.infer<typeof ManualTriggerConfigSchema>;

export const HeartbeatTriggerConfigSchema = z.object({
  type: z.literal('heartbeat'),
  cronExpression: z.string().min(1),
  timezone: z.string().default('UTC'),
});
export type HeartbeatTriggerConfig = z.infer<typeof HeartbeatTriggerConfigSchema>;

export const WebhookTriggerConfigSchema = z.object({
  type: z.literal('webhook'),
  pathSegment: z.string().min(1),
  secret: z.string().min(32),
});
export type WebhookTriggerConfig = z.infer<typeof WebhookTriggerConfigSchema>;

export const TaskTriggerConfigSchema = z.discriminatedUnion('type', [
  ManualTriggerConfigSchema,
  HeartbeatTriggerConfigSchema,
  WebhookTriggerConfigSchema,
]);
export type TaskTriggerConfig = z.infer<typeof TaskTriggerConfigSchema>;

// --- Task Definition Schema ---

export const TaskDefinitionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().default(''),
  trigger: TaskTriggerConfigSchema,
  orchestratorInstructions: z.string().min(1),
  context: z.record(z.unknown()).optional(),
  enabled: z.boolean().default(false),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TaskDefinition = z.infer<typeof TaskDefinitionSchema>;

// --- Task Create/Update Input Schemas (for tRPC) ---

export const TaskCreateInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().default(''),
  trigger: TaskTriggerConfigSchema,
  orchestratorInstructions: z.string().min(1),
  context: z.record(z.unknown()).optional(),
  enabled: z.boolean().default(false),
});
export type TaskCreateInput = z.infer<typeof TaskCreateInputSchema>;

export const TaskUpdateInputSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  trigger: TaskTriggerConfigSchema.optional(),
  orchestratorInstructions: z.string().min(1).optional(),
  context: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
});
export type TaskUpdateInput = z.infer<typeof TaskUpdateInputSchema>;

// --- Task Execution Record Schema ---

export const TaskExecutionRecordSchema = z.object({
  id: z.string().uuid(),
  taskDefinitionId: z.string().uuid(),
  projectId: z.string().uuid(),
  triggeredAt: z.string().datetime(),
  triggerType: z.enum(['manual', 'heartbeat', 'webhook']),
  status: z.enum(['running', 'completed', 'failed']),
  completedAt: z.string().datetime().optional(),
  outcome: z.string().optional(),
  orchestratorAgentId: z.string().optional(),
  durationMs: z.number().optional(),
});
export type TaskExecutionRecord = z.infer<typeof TaskExecutionRecordSchema>;
