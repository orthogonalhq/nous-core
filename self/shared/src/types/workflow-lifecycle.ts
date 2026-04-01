import { z } from 'zod';
import {
  ProjectIdSchema,
  WorkflowDefinitionIdSchema,
  WorkflowEdgeIdSchema,
  WorkflowExecutionIdSchema,
  WorkflowNodeDefinitionIdSchema,
} from './ids.js';
import {
  CompositeSkillDependencySchema,
  ResolvedWorkflowDefinitionSourceSchema,
  WorkflowFlowDocumentSchema,
  WorkflowManifestFrontmatterSchema,
  WorkflowPackageToolDependencySchema,
} from './package-documents.js';
import {
  WorkflowCheckpointStateSchema,
  WorkflowNodeKindSchema,
  WorkflowRunStatusSchema,
  WorkflowRunTriggerContextSchema,
} from './workflow.js';
import type { WorkflowNodeKind } from './workflow.js';
import { ExecutionModelSchema, GovernanceLevelSchema } from './enums.js';
import { WorkflowDispatchLineageIdSchema } from './ids.js';

// ---------------------------------------------------------------------------
// Dispatch mapping types and constant
// ---------------------------------------------------------------------------

export const WorkflowExecutionModeSchema = z.enum(['internal', 'dispatched']);
export type WorkflowExecutionMode = z.infer<typeof WorkflowExecutionModeSchema>;

export const WorkflowDispatchAgentClassSchema = z
  .enum(['Orchestrator', 'Worker'])
  .nullable();
export type WorkflowDispatchAgentClass = z.infer<
  typeof WorkflowDispatchAgentClassSchema
>;

export const WorkflowNodeDispatchMappingSchema = z
  .object({
    executionMode: WorkflowExecutionModeSchema,
    agentClass: WorkflowDispatchAgentClassSchema,
  })
  .strict();
export type WorkflowNodeDispatchMapping = z.infer<
  typeof WorkflowNodeDispatchMappingSchema
>;

/**
 * Static dispatch mapping table — maps every `WorkflowNodeKind` to an
 * execution mode and agent class. Matches the ratified ADR
 * `node-dispatch-mapping-v1`.
 */
export const WORKFLOW_NODE_DISPATCH_MAP = {
  'model-call': { executionMode: 'dispatched', agentClass: 'Worker' },
  'tool-execution': { executionMode: 'dispatched', agentClass: 'Worker' },
  'subworkflow': { executionMode: 'dispatched', agentClass: 'Orchestrator' },
  'condition': { executionMode: 'internal', agentClass: null },
  'transform': { executionMode: 'internal', agentClass: null },
  'quality-gate': { executionMode: 'internal', agentClass: null },
  'human-decision': { executionMode: 'internal', agentClass: null },
} as const satisfies Record<WorkflowNodeKind, WorkflowNodeDispatchMapping>;

export const WorkflowNodeDispatchMetadataSchema = z
  .object({
    nodeDefinitionId: WorkflowNodeDefinitionIdSchema,
    nodeType: WorkflowNodeKindSchema,
    nodeName: z.string().min(1),
    executionMode: WorkflowExecutionModeSchema,
    agentClass: WorkflowDispatchAgentClassSchema,
    dispatchLineageId: WorkflowDispatchLineageIdSchema.optional(),
  })
  .strict();
export type WorkflowNodeDispatchMetadata = z.infer<
  typeof WorkflowNodeDispatchMetadataSchema
>;

export const WorkflowLifecycleListQuerySchema = z
  .object({
    projectId: ProjectIdSchema.optional(),
    status: z.array(WorkflowRunStatusSchema).optional(),
    definition: z.string().min(1).optional(),
    includeInstalledDefinitions: z.boolean().optional(),
    includeActiveInstances: z.boolean().optional(),
  })
  .strict()
  .transform((value) => ({
    projectId: value.projectId,
    status: value.status ?? [],
    definition: value.definition,
    includeInstalledDefinitions: value.includeInstalledDefinitions ?? true,
    includeActiveInstances: value.includeActiveInstances ?? true,
  }));
export type WorkflowLifecycleListQuery = z.output<
  typeof WorkflowLifecycleListQuerySchema
>;

export const WorkflowLifecycleDefinitionSummarySchema = z
  .object({
    packageId: z.string().min(1),
    packageVersion: z.string().min(1).optional(),
    name: z.string().min(1),
    description: z.string().min(1),
    entrypoint: z.string().min(1),
    entrypoints: z.array(z.string().min(1)).default([]),
    skillDependencies: z.array(CompositeSkillDependencySchema).default([]),
    toolDependencies: z.array(WorkflowPackageToolDependencySchema).default([]),
    rootRef: z.string().min(1),
    manifestRef: z.string().min(1),
    flowRef: z.string().min(1).optional(),
  })
  .strict();
export type WorkflowLifecycleDefinitionSummary = z.infer<
  typeof WorkflowLifecycleDefinitionSummarySchema
>;

export const WorkflowLifecycleInstanceSummarySchema = z
  .object({
    runId: WorkflowExecutionIdSchema,
    projectId: ProjectIdSchema,
    workflowDefinitionId: WorkflowDefinitionIdSchema,
    definitionName: z.string().min(1),
    status: WorkflowRunStatusSchema,
    reasonCode: z.string().min(1).optional(),
    activeNodeIds: z.array(WorkflowNodeDefinitionIdSchema).default([]),
    waitingNodeIds: z.array(WorkflowNodeDefinitionIdSchema).default([]),
    blockedNodeIds: z.array(WorkflowNodeDefinitionIdSchema).default([]),
    checkpointState: WorkflowCheckpointStateSchema,
    lastCommittedCheckpointId: z.string().uuid().optional(),
    startedAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    definitionSource: ResolvedWorkflowDefinitionSourceSchema.optional(),
    readyNodeIds: z.array(WorkflowNodeDefinitionIdSchema).default([]),
    readyNodeDispatchMetadata: z
      .array(WorkflowNodeDispatchMetadataSchema)
      .default([]),
  })
  .strict();
export type WorkflowLifecycleInstanceSummary = z.infer<
  typeof WorkflowLifecycleInstanceSummarySchema
>;

export const WorkflowLifecycleListResultSchema = z
  .object({
    definitions: z.array(WorkflowLifecycleDefinitionSummarySchema).default([]),
    instances: z.array(WorkflowLifecycleInstanceSummarySchema).default([]),
  })
  .strict();
export type WorkflowLifecycleListResult = z.infer<
  typeof WorkflowLifecycleListResultSchema
>;

export const WorkflowLifecycleInspectQuerySchema = z
  .object({
    packageId: z.string().min(1),
  })
  .strict();
export type WorkflowLifecycleInspectQuery = z.infer<
  typeof WorkflowLifecycleInspectQuerySchema
>;

export const WorkflowLifecycleInspectStepSchema = z
  .object({
    stepId: z.string().min(1),
    fileRef: z.string().min(1),
    name: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    type: WorkflowNodeKindSchema.optional(),
    governance: GovernanceLevelSchema.optional(),
    executionModel: ExecutionModelSchema.optional(),
  })
  .strict();
export type WorkflowLifecycleInspectStep = z.infer<
  typeof WorkflowLifecycleInspectStepSchema
>;

export const WorkflowLifecycleResourceRefsSchema = z
  .object({
    references: z.array(z.string().min(1)).default([]),
    scripts: z.array(z.string().min(1)).default([]),
    assets: z.array(z.string().min(1)).default([]),
  })
  .strict();
export type WorkflowLifecycleResourceRefs = z.infer<
  typeof WorkflowLifecycleResourceRefsSchema
>;

export const WorkflowLifecycleInspectResultSchema = z
  .object({
    packageId: z.string().min(1),
    packageVersion: z.string().min(1).optional(),
    manifest: WorkflowManifestFrontmatterSchema,
    flow: WorkflowFlowDocumentSchema,
    steps: z.array(WorkflowLifecycleInspectStepSchema).min(1),
    resourceRefs: WorkflowLifecycleResourceRefsSchema,
  })
  .strict();
export type WorkflowLifecycleInspectResult = z.infer<
  typeof WorkflowLifecycleInspectResultSchema
>;

export const WorkflowLifecycleStartCommandSchema = z
  .object({
    definition: z.string().min(1).optional(),
    yamlSpec: z.string().min(1).optional(),
    projectId: ProjectIdSchema,
    entrypoint: z.string().min(1).optional(),
    config: z.record(z.unknown()).optional(),
    triggerContext: WorkflowRunTriggerContextSchema.optional(),
  })
  .strict()
  .refine(
    (value) => value.definition != null || value.yamlSpec != null,
    { message: 'Either definition or yamlSpec must be provided' },
  )
  .transform((value) => ({
    definition: value.definition,
    yamlSpec: value.yamlSpec,
    projectId: value.projectId,
    entrypoint: value.entrypoint,
    config: value.config ?? {},
    triggerContext: value.triggerContext,
  }));
export type WorkflowLifecycleStartCommand = z.output<
  typeof WorkflowLifecycleStartCommandSchema
>;

export const WorkflowLifecycleValidateCommandSchema = z
  .object({
    yamlSpec: z.string().min(1),
  })
  .strict();
export type WorkflowLifecycleValidateCommand = z.infer<
  typeof WorkflowLifecycleValidateCommandSchema
>;

export const WorkflowLifecycleFromSpecCommandSchema = z
  .object({
    yamlSpec: z.string().min(1),
    projectId: ProjectIdSchema,
  })
  .strict();
export type WorkflowLifecycleFromSpecCommand = z.infer<
  typeof WorkflowLifecycleFromSpecCommandSchema
>;

export const WorkflowLifecycleStatusQuerySchema = z
  .object({
    runId: WorkflowExecutionIdSchema,
  })
  .strict();
export type WorkflowLifecycleStatusQuery = z.infer<
  typeof WorkflowLifecycleStatusQuerySchema
>;

export const WorkflowLifecycleStatusResultSchema = z
  .object({
    run: WorkflowLifecycleInstanceSummarySchema,
    readyNodeIds: z.array(WorkflowNodeDefinitionIdSchema).default([]),
    completedNodeIds: z.array(WorkflowNodeDefinitionIdSchema).default([]),
    activatedEdgeIds: z.array(WorkflowEdgeIdSchema).default([]),
    checkpointState: WorkflowCheckpointStateSchema,
    lastPreparedCheckpointId: z.string().uuid().optional(),
    lastCommittedCheckpointId: z.string().uuid().optional(),
    governanceGateHits: z.array(z.string().min(1)).default([]),
  })
  .strict();
export type WorkflowLifecycleStatusResult = z.infer<
  typeof WorkflowLifecycleStatusResultSchema
>;

export const WorkflowLifecyclePauseCommandSchema = z
  .object({
    runId: WorkflowExecutionIdSchema,
    reasonCode: z.string().min(1).optional(),
  })
  .strict()
  .transform((value) => ({
    runId: value.runId,
    reasonCode: value.reasonCode ?? 'workflow_paused',
  }));
export type WorkflowLifecyclePauseCommand = z.output<
  typeof WorkflowLifecyclePauseCommandSchema
>;

export const WorkflowLifecycleResumeCommandSchema = z
  .object({
    runId: WorkflowExecutionIdSchema,
    reasonCode: z.string().min(1).optional(),
  })
  .strict()
  .transform((value) => ({
    runId: value.runId,
    reasonCode: value.reasonCode ?? 'workflow_resumed',
  }));
export type WorkflowLifecycleResumeCommand = z.output<
  typeof WorkflowLifecycleResumeCommandSchema
>;

export const WorkflowLifecycleCancelCommandSchema = z
  .object({
    runId: WorkflowExecutionIdSchema,
    reasonCode: z.string().min(1).optional(),
  })
  .strict()
  .transform((value) => ({
    runId: value.runId,
    reasonCode: value.reasonCode ?? 'workflow_canceled',
  }));
export type WorkflowLifecycleCancelCommand = z.output<
  typeof WorkflowLifecycleCancelCommandSchema
>;

export const WorkflowLifecycleEvidenceRefSchema = z
  .object({
    actionCategory: z.string().min(1),
    authorizationEventId: z.string().min(1).optional(),
    completionEventId: z.string().min(1).optional(),
  })
  .strict();
export type WorkflowLifecycleEvidenceRef = z.infer<
  typeof WorkflowLifecycleEvidenceRefSchema
>;

export const WorkflowLifecycleMutationResultSchema = z
  .object({
    run: WorkflowLifecycleInstanceSummarySchema,
    evidenceRef: WorkflowLifecycleEvidenceRefSchema.optional(),
    warnings: z.array(z.string().min(1)).default([]),
  })
  .strict();
export type WorkflowLifecycleMutationResult = z.infer<
  typeof WorkflowLifecycleMutationResultSchema
>;

// ---------------------------------------------------------------------------
// MCP tool request schemas for workflow node operations
// ---------------------------------------------------------------------------

export const WorkflowExecuteNodeToolRequestSchema = z
  .object({
    runId: WorkflowExecutionIdSchema,
    nodeDefinitionId: WorkflowNodeDefinitionIdSchema,
    payload: z.unknown().optional(),
  })
  .strict();
export type WorkflowExecuteNodeToolRequest = z.infer<
  typeof WorkflowExecuteNodeToolRequestSchema
>;

export const WorkflowCompleteNodeToolRequestSchema = z
  .object({
    runId: WorkflowExecutionIdSchema,
    nodeDefinitionId: WorkflowNodeDefinitionIdSchema,
    output: z.unknown().optional(),
    status: z.enum(['completed', 'failed']).default('completed'),
    reasonCode: z.string().min(1).optional(),
    evidenceRefs: z.array(z.string().min(1)).default([]),
  })
  .strict();
export type WorkflowCompleteNodeToolRequest = z.infer<
  typeof WorkflowCompleteNodeToolRequestSchema
>;
