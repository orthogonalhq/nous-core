/**
 * Workflow runtime contract types for Nous-OSS.
 *
 * Phase 9.1 — canonical workflow definition, derived graph, admission,
 * run-state, and dispatch-lineage baseline.
 */
import { z } from 'zod';
import {
  WorkflowDefinitionIdSchema,
  WorkflowNodeDefinitionIdSchema,
  WorkflowEdgeIdSchema,
  WorkflowNodeRunIdSchema,
  WorkflowDispatchLineageIdSchema,
  WorkflowExecutionIdSchema,
  ProjectIdSchema,
} from './ids.js';
import {
  GovernanceLevelSchema,
  ExecutionModelSchema,
  NodeTypeSchema,
} from './enums.js';
import { WorkmodeIdSchema } from './workmode.js';
import { ProjectControlStateSchema } from './mao.js';

export const WorkflowDefinitionModeSchema = z.enum(['protocol', 'hybrid']);
export type WorkflowDefinitionMode = z.infer<
  typeof WorkflowDefinitionModeSchema
>;

export const WorkflowNodeKindSchema = z.union([
  NodeTypeSchema,
  z.literal('subworkflow'),
]);
export type WorkflowNodeKind = z.infer<typeof WorkflowNodeKindSchema>;

export const WorkflowAuthorityActorSchema = z.enum([
  'nous_cortex',
  'orchestration_agent',
  'worker_agent',
]);
export type WorkflowAuthorityActor = z.infer<
  typeof WorkflowAuthorityActorSchema
>;

export const WorkflowNodeDefinitionSchema = z.object({
  id: WorkflowNodeDefinitionIdSchema,
  name: z.string().min(1),
  type: WorkflowNodeKindSchema,
  description: z.string().min(1).optional(),
  governance: GovernanceLevelSchema,
  executionModel: ExecutionModelSchema,
  config: z.record(z.unknown()).default({}),
});
export type WorkflowNodeDefinition = z.infer<
  typeof WorkflowNodeDefinitionSchema
>;

export const WorkflowEdgeDefinitionSchema = z.object({
  id: WorkflowEdgeIdSchema,
  from: WorkflowNodeDefinitionIdSchema,
  to: WorkflowNodeDefinitionIdSchema,
  branchKey: z.string().min(1).optional(),
  conditionRef: z.string().min(1).optional(),
  priority: z.number().int().min(0).default(0),
});
export type WorkflowEdgeDefinition = z.infer<
  typeof WorkflowEdgeDefinitionSchema
>;

export const WorkflowDefinitionSchema = z.object({
  id: WorkflowDefinitionIdSchema,
  projectId: ProjectIdSchema,
  mode: WorkflowDefinitionModeSchema,
  version: z.string().min(1),
  name: z.string().min(1),
  entryNodeIds: z.array(WorkflowNodeDefinitionIdSchema).min(1),
  nodes: z.array(WorkflowNodeDefinitionSchema).min(1),
  edges: z.array(WorkflowEdgeDefinitionSchema).default([]),
});
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

export const DerivedWorkflowNodeSchema = z.object({
  definition: WorkflowNodeDefinitionSchema,
  inboundEdgeIds: z.array(WorkflowEdgeIdSchema).default([]),
  outboundEdgeIds: z.array(WorkflowEdgeIdSchema).default([]),
  topologicalIndex: z.number().int().nonnegative(),
});
export type DerivedWorkflowNode = z.infer<typeof DerivedWorkflowNodeSchema>;

export const DerivedWorkflowGraphSchema = z.object({
  workflowDefinitionId: WorkflowDefinitionIdSchema,
  projectId: ProjectIdSchema,
  version: z.string().min(1),
  graphDigest: z.string().regex(/^[a-f0-9]{64}$/),
  entryNodeIds: z.array(WorkflowNodeDefinitionIdSchema).min(1),
  topologicalOrder: z.array(WorkflowNodeDefinitionIdSchema),
  nodes: z.record(z.string().uuid(), DerivedWorkflowNodeSchema),
  edges: z.record(z.string().uuid(), WorkflowEdgeDefinitionSchema),
});
export type DerivedWorkflowGraph = z.infer<typeof DerivedWorkflowGraphSchema>;

export const WorkflowAdmissionRequestSchema = z.object({
  projectId: ProjectIdSchema,
  workflowDefinitionId: WorkflowDefinitionIdSchema,
  workmodeId: WorkmodeIdSchema,
  sourceActor: WorkflowAuthorityActorSchema,
  targetActor: WorkflowAuthorityActorSchema.default('worker_agent'),
  controlState: ProjectControlStateSchema.optional(),
});
export type WorkflowAdmissionRequest = z.infer<
  typeof WorkflowAdmissionRequestSchema
>;

const WorkflowAdmissionAllowedResultSchema = z.object({
  allowed: z.literal(true),
  reasonCode: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  policyRef: z.string().min(1).optional(),
});

const WorkflowAdmissionBlockedResultSchema = z.object({
  allowed: z.literal(false),
  reasonCode: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)).min(1),
  policyRef: z.string().min(1).optional(),
  detail: z.record(z.unknown()).optional(),
});

export const WorkflowAdmissionResultSchema = z.discriminatedUnion('allowed', [
  WorkflowAdmissionAllowedResultSchema,
  WorkflowAdmissionBlockedResultSchema,
]);
export type WorkflowAdmissionResult = z.infer<
  typeof WorkflowAdmissionResultSchema
>;

export const WorkflowDispatchLineageSchema = z.object({
  id: WorkflowDispatchLineageIdSchema,
  runId: WorkflowExecutionIdSchema,
  nodeDefinitionId: WorkflowNodeDefinitionIdSchema,
  parentNodeDefinitionId: WorkflowNodeDefinitionIdSchema.optional(),
  viaEdgeId: WorkflowEdgeIdSchema.optional(),
  attempt: z.number().int().nonnegative(),
  reasonCode: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  occurredAt: z.string().datetime(),
});
export type WorkflowDispatchLineage = z.infer<
  typeof WorkflowDispatchLineageSchema
>;

export const WorkflowNodeRunStatusSchema = z.enum([
  'pending',
  'ready',
  'dispatched',
  'running',
  'completed',
  'skipped',
  'blocked',
  'failed',
]);
export type WorkflowNodeRunStatus = z.infer<
  typeof WorkflowNodeRunStatusSchema
>;

export const WorkflowRunStatusSchema = z.enum([
  'admission_blocked',
  'ready',
  'running',
  'paused',
  'completed',
  'failed',
]);
export type WorkflowRunStatus = z.infer<typeof WorkflowRunStatusSchema>;

export const WorkflowTransitionInputSchema = z.object({
  reasonCode: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  occurredAt: z.string().datetime().optional(),
});
export type WorkflowTransitionInput = z.infer<
  typeof WorkflowTransitionInputSchema
>;

export const WorkflowNodeRunStateSchema = z.object({
  id: WorkflowNodeRunIdSchema,
  nodeDefinitionId: WorkflowNodeDefinitionIdSchema,
  status: WorkflowNodeRunStatusSchema,
  attempt: z.number().int().nonnegative().default(0),
  reasonCode: z.string().min(1).optional(),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  lastDispatchLineageId: WorkflowDispatchLineageIdSchema.optional(),
  updatedAt: z.string().datetime(),
});
export type WorkflowNodeRunState = z.infer<typeof WorkflowNodeRunStateSchema>;

export const WorkflowRunStateSchema = z.object({
  runId: WorkflowExecutionIdSchema,
  workflowDefinitionId: WorkflowDefinitionIdSchema,
  projectId: ProjectIdSchema,
  workflowVersion: z.string().min(1),
  graphDigest: z.string().regex(/^[a-f0-9]{64}$/),
  status: WorkflowRunStatusSchema,
  admission: WorkflowAdmissionResultSchema,
  reasonCode: z.string().min(1).optional(),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  readyNodeIds: z.array(WorkflowNodeDefinitionIdSchema).default([]),
  completedNodeIds: z.array(WorkflowNodeDefinitionIdSchema).default([]),
  nodeStates: z.record(z.string().uuid(), WorkflowNodeRunStateSchema),
  dispatchLineage: z.array(WorkflowDispatchLineageSchema).default([]),
  startedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type WorkflowRunState = z.infer<typeof WorkflowRunStateSchema>;

export const WorkflowStartResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('admission_blocked'),
    admission: WorkflowAdmissionBlockedResultSchema,
  }),
  z.object({
    status: z.literal('started'),
    graph: DerivedWorkflowGraphSchema,
    runState: WorkflowRunStateSchema,
  }),
]);
export type WorkflowStartResult = z.infer<typeof WorkflowStartResultSchema>;

// Backward-compatible aliases for the previous placeholder names.
export const WorkflowGraphSchema = DerivedWorkflowGraphSchema;
export type WorkflowGraph = DerivedWorkflowGraph;

export const WorkflowStateSchema = WorkflowRunStateSchema;
export type WorkflowState = WorkflowRunState;
