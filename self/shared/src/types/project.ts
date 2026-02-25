/**
 * Project domain types for Nous-OSS.
 *
 * Derived from project-model.mdx. Covers node schemas, workflow graphs,
 * escalation contracts, project configuration, and project state.
 */
import { z } from 'zod';
import {
  ProjectIdSchema,
  NodeIdSchema,
} from './ids.js';
import {
  NodeTypeSchema,
  ModelRoleSchema,
  GovernanceLevelSchema,
  EscalationChannelSchema,
  ExecutionModelSchema,
  ProjectTypeSchema,
  PfcTierSchema,
  EscalationPrioritySchema,
  TimeoutActionSchema,
  TimeoutDefaultActionSchema,
} from './enums.js';
import {
  AccessListSchema,
  MemoryAccessPolicySchema,
} from './memory.js';

// --- Project Identity Contract ---
// Canonical subset of project fields for deterministic identity across surfaces.
export const ProjectIdentityContractSchema = z.object({
  id: ProjectIdSchema,
  name: z.string().min(1),
  type: ProjectTypeSchema,
});
export type ProjectIdentityContract = z.infer<
  typeof ProjectIdentityContractSchema
>;

// --- Node Memory Access Policy Override ---
// Optional. When present, MUST be more restrictive than project policy.
// Schema defines structure only; "more restrictive" comparison is runtime in phase-3.2.
export const NodeMemoryAccessPolicyOverrideSchema = z.object({
  canReadFrom: AccessListSchema.optional(),
  canBeReadBy: AccessListSchema.optional(),
  inheritsGlobal: z.boolean().optional(),
});
export type NodeMemoryAccessPolicyOverride = z.infer<
  typeof NodeMemoryAccessPolicyOverrideSchema
>;

// --- Node Schema ---
// From project-model.mdx "Node Schema".
export const NodeSchemaDefinition = z.object({
  id: NodeIdSchema,
  name: z.string(),
  type: NodeTypeSchema,
  inputs: z.record(z.string(), z.unknown()),
  outputs: z.record(z.string(), z.unknown()),
  modelRole: ModelRoleSchema.optional(),
  governance: GovernanceLevelSchema,
  escalation: z.object({
    enabled: z.boolean(),
    channels: z.array(EscalationChannelSchema),
    confidenceThreshold: z.number().min(0).max(1).optional(),
  }),
  timeout: z.object({
    durationMs: z.number().positive(),
    retries: z.number().int().min(0),
    onTimeout: TimeoutActionSchema,
  }),
  executionModel: ExecutionModelSchema,
  memoryAccessPolicyOverride: NodeMemoryAccessPolicyOverrideSchema.optional(),
});
export type NodeSchema = z.infer<typeof NodeSchemaDefinition>;

// --- Workflow Graph ---
// A workflow definition — nodes, edges, entry point.
export const WorkflowEdgeSchema = z.object({
  from: NodeIdSchema,
  to: NodeIdSchema,
  condition: z.string().optional(),
});
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;

export const WorkflowGraphSchema = z.object({
  nodes: z.array(NodeSchemaDefinition),
  edges: z.array(WorkflowEdgeSchema),
  entryNodeId: NodeIdSchema,
});
export type WorkflowGraph = z.infer<typeof WorkflowGraphSchema>;

// --- Workflow State ---
// Current state of a workflow execution.
export const WorkflowStateSchema = z.object({
  status: z.enum(['running', 'paused', 'completed', 'failed']),
  activeNodeId: NodeIdSchema.optional(),
  completedNodeIds: z.array(NodeIdSchema),
  failedNodeId: NodeIdSchema.optional(),
  error: z.string().optional(),
  startedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type WorkflowState = z.infer<typeof WorkflowStateSchema>;

// --- Escalation Contract ---
// From project-model.mdx "Escalation Contract".
export const EscalationContractSchema = z.object({
  context: z.string(),
  triggerReason: z.string(),
  recommendation: z.string().optional(),
  requiredAction: z.string(),
  timeoutMs: z.number().positive().optional(),
  defaultOnTimeout: TimeoutDefaultActionSchema.optional(),
  channel: EscalationChannelSchema,
  projectId: ProjectIdSchema,
  nodeId: NodeIdSchema.optional(),
  priority: EscalationPrioritySchema,
  timestamp: z.string().datetime(),
});
export type EscalationContract = z.infer<typeof EscalationContractSchema>;

// --- Project Configuration ---
export const ProjectConfigSchema = z.object({
  id: ProjectIdSchema,
  name: z.string().min(1),
  type: ProjectTypeSchema,
  pfcTier: PfcTierSchema,
  modelAssignments: z.record(ModelRoleSchema, z.string()).optional(),
  memoryAccessPolicy: MemoryAccessPolicySchema,
  escalationChannels: z.array(EscalationChannelSchema),
  retrievalBudgetTokens: z.number().positive().default(500),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

// --- Project State ---
// Current runtime state of a project.
export const ProjectStateSchema = z.object({
  status: z.enum(['active', 'paused', 'archived', 'error']),
  activeWorkflows: z.number().int().min(0),
  lastActivityAt: z.string().datetime().optional(),
});
export type ProjectState = z.infer<typeof ProjectStateSchema>;
