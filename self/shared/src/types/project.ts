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
  WorkflowDefinitionIdSchema,
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
import {
  WorkflowDefinitionSchema,
  WorkflowEdgeDefinitionSchema,
  WorkflowGraphSchema,
  WorkflowStateSchema,
  type WorkflowDefinition,
  type WorkflowEdgeDefinition,
  type WorkflowGraph,
  type WorkflowState,
} from './workflow.js';

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

// --- Workflow Definition and Derived Runtime Aliases ---
// Phase 9.1 promotes the shared workflow runtime contract family to the
// canonical workflow source for projects. These aliases preserve the older
// placeholder names while consumers migrate to the richer types.
export const WorkflowEdgeSchema = WorkflowEdgeDefinitionSchema;
export type WorkflowEdge = WorkflowEdgeDefinition;
export { WorkflowGraphSchema, WorkflowStateSchema };
export type { WorkflowDefinition, WorkflowGraph, WorkflowState };

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
export const ProjectWorkflowConfigurationSchema = z.object({
  definitions: z.array(WorkflowDefinitionSchema).default([]),
  defaultWorkflowDefinitionId: WorkflowDefinitionIdSchema.optional(),
});
export type ProjectWorkflowConfiguration = z.infer<
  typeof ProjectWorkflowConfigurationSchema
>;

export const ProjectConfigSchema = z.object({
  id: ProjectIdSchema,
  name: z.string().min(1),
  type: ProjectTypeSchema,
  pfcTier: PfcTierSchema,
  modelAssignments: z.record(ModelRoleSchema, z.string()).optional(),
  memoryAccessPolicy: MemoryAccessPolicySchema,
  escalationChannels: z.array(EscalationChannelSchema),
  workflow: ProjectWorkflowConfigurationSchema.optional(),
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
