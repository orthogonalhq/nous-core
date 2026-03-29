/**
 * Workflow runtime contract types for Nous-OSS.
 *
 * Phase 9.2 — canonical workflow definition, governed node execution,
 * continuation, checkpoint, and run-state contracts.
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
  ModelRoleSchema,
} from './enums.js';
import { WorkmodeIdSchema } from './workmode.js';
import { ProjectControlStateSchema, type ProjectControlState } from './mao.js';
import { IngressTriggerTypeSchema } from './ingress-trigger.js';
import {
  ConfidenceGovernanceEvaluationInputSchema,
  ConfidenceGovernanceEvaluationResultSchema,
  type ConfidenceGovernanceEvaluationInput,
  type ConfidenceGovernanceEvaluationResult,
} from './confidence-governance.js';
import type { ProjectConfig } from './project.js';

export const WorkflowSchemaRefSchema = z.string().min(1);
export type WorkflowSchemaRef = z.infer<typeof WorkflowSchemaRefSchema>;

export const WorkflowNodeIoLegacySourceSchema = z.enum([
  'top_level',
  'model_call_config',
  'tool_execution_config',
  'none',
]);
export type WorkflowNodeIoLegacySource = z.infer<
  typeof WorkflowNodeIoLegacySourceSchema
>;

export const NormalizedWorkflowNodeIoContractSchema = z
  .object({
    inputSchemaRef: WorkflowSchemaRefSchema.optional(),
    outputSchemaRef: WorkflowSchemaRefSchema.optional(),
    legacySource: WorkflowNodeIoLegacySourceSchema,
  })
  .strict();
export type NormalizedWorkflowNodeIoContract = z.infer<
  typeof NormalizedWorkflowNodeIoContractSchema
>;

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

export const WorkflowModelCallNodeConfigSchema = z.object({
  type: z.literal('model-call'),
  modelRole: ModelRoleSchema,
  promptRef: z.string().min(1),
  outputSchemaRef: WorkflowSchemaRefSchema.optional(),
});
export type WorkflowModelCallNodeConfig = z.infer<
  typeof WorkflowModelCallNodeConfigSchema
>;

export const WorkflowToolExecutionNodeConfigSchema = z.object({
  type: z.literal('tool-execution'),
  toolName: z.string().min(1),
  inputMappingRef: z.string().min(1),
  resultSchemaRef: WorkflowSchemaRefSchema.optional(),
});
export type WorkflowToolExecutionNodeConfig = z.infer<
  typeof WorkflowToolExecutionNodeConfigSchema
>;

export const WorkflowConditionNodeConfigSchema = z.object({
  type: z.literal('condition'),
  predicateRef: z.string().min(1),
  trueBranchKey: z.string().min(1),
  falseBranchKey: z.string().min(1),
});
export type WorkflowConditionNodeConfig = z.infer<
  typeof WorkflowConditionNodeConfigSchema
>;

export const WorkflowTransformNodeConfigSchema = z.object({
  type: z.literal('transform'),
  transformRef: z.string().min(1),
  inputMappingRef: z.string().min(1),
});
export type WorkflowTransformNodeConfig = z.infer<
  typeof WorkflowTransformNodeConfigSchema
>;

export const WorkflowQualityGateNodeConfigSchema = z.object({
  type: z.literal('quality-gate'),
  evaluatorRef: z.string().min(1),
  passThresholdRef: z.string().min(1),
  failureAction: z.enum(['block', 'reprompt', 'rollback']),
});
export type WorkflowQualityGateNodeConfig = z.infer<
  typeof WorkflowQualityGateNodeConfigSchema
>;

export const WorkflowHumanDecisionNodeConfigSchema = z.object({
  type: z.literal('human-decision'),
  decisionRef: z.string().min(1),
  timeoutMs: z.number().positive().optional(),
  defaultOnTimeout: z.enum(['halt', 'fallback']).optional(),
});
export type WorkflowHumanDecisionNodeConfig = z.infer<
  typeof WorkflowHumanDecisionNodeConfigSchema
>;

export const WorkflowSubworkflowNodeConfigSchema = z
  .object({
    type: z.literal('subworkflow'),
    subworkflowDefinitionId: WorkflowDefinitionIdSchema.optional(),
  })
  .passthrough();
export type WorkflowSubworkflowNodeConfig = z.infer<
  typeof WorkflowSubworkflowNodeConfigSchema
>;

export const WorkflowTypedNodeConfigSchema = z.discriminatedUnion('type', [
  WorkflowModelCallNodeConfigSchema,
  WorkflowToolExecutionNodeConfigSchema,
  WorkflowConditionNodeConfigSchema,
  WorkflowTransformNodeConfigSchema,
  WorkflowQualityGateNodeConfigSchema,
  WorkflowHumanDecisionNodeConfigSchema,
]);
export type WorkflowTypedNodeConfig = z.infer<
  typeof WorkflowTypedNodeConfigSchema
>;

export const WorkflowNodeConfigSchema = z.discriminatedUnion('type', [
  WorkflowModelCallNodeConfigSchema,
  WorkflowToolExecutionNodeConfigSchema,
  WorkflowConditionNodeConfigSchema,
  WorkflowTransformNodeConfigSchema,
  WorkflowQualityGateNodeConfigSchema,
  WorkflowHumanDecisionNodeConfigSchema,
  WorkflowSubworkflowNodeConfigSchema,
]);
export type WorkflowNodeConfig = z.infer<typeof WorkflowNodeConfigSchema>;

export const WorkflowNodeMetadataSchema = z.object({
  specNodeId: z.string().min(1),
  skill: z.string().min(1).optional(),
  contracts: z.array(z.string().min(1)).optional(),
  templates: z.array(z.string().min(1)).optional(),
  displayName: z.string().min(1).optional(),
});
export type WorkflowNodeMetadata = z.infer<typeof WorkflowNodeMetadataSchema>;

export const WorkflowNodeDefinitionSchema = z
  .object({
    id: WorkflowNodeDefinitionIdSchema,
    name: z.string().min(1),
    type: WorkflowNodeKindSchema,
    description: z.string().min(1).optional(),
    governance: GovernanceLevelSchema,
    executionModel: ExecutionModelSchema,
    inputSchemaRef: WorkflowSchemaRefSchema.optional(),
    outputSchemaRef: WorkflowSchemaRefSchema.optional(),
    config: WorkflowNodeConfigSchema,
    metadata: WorkflowNodeMetadataSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type !== value.config.type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['config', 'type'],
        message: `workflow node config.type (${value.config.type}) must match node type (${value.type})`,
      });
    }

    if (
      value.config.type === 'condition' &&
      value.config.trueBranchKey === value.config.falseBranchKey
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['config', 'falseBranchKey'],
        message: 'condition branch keys must be distinct',
      });
    }
  });
export type WorkflowNodeDefinition = z.infer<
  typeof WorkflowNodeDefinitionSchema
>;

export function resolveWorkflowNodeIoContract(
  node: WorkflowNodeDefinition,
): NormalizedWorkflowNodeIoContract {
  if (node.inputSchemaRef || node.outputSchemaRef) {
    return NormalizedWorkflowNodeIoContractSchema.parse({
      inputSchemaRef: node.inputSchemaRef,
      outputSchemaRef: node.outputSchemaRef,
      legacySource: 'top_level',
    });
  }

  if (node.config.type === 'model-call' && node.config.outputSchemaRef) {
    return NormalizedWorkflowNodeIoContractSchema.parse({
      outputSchemaRef: node.config.outputSchemaRef,
      legacySource: 'model_call_config',
    });
  }

  if (node.config.type === 'tool-execution' && node.config.resultSchemaRef) {
    return NormalizedWorkflowNodeIoContractSchema.parse({
      outputSchemaRef: node.config.resultSchemaRef,
      legacySource: 'tool_execution_config',
    });
  }

  return NormalizedWorkflowNodeIoContractSchema.parse({
    legacySource: 'none',
  });
}

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
  branchKey: z.string().min(1).optional(),
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
  'running',
  'waiting',
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
  'waiting',
  'blocked_review',
  'paused',
  'canceled',
  'completed',
  'failed',
]);
export type WorkflowRunStatus = z.infer<typeof WorkflowRunStatusSchema>;

export const WorkflowCheckpointStateSchema = z.enum([
  'idle',
  'prepare_pending',
  'commit_pending',
]);
export type WorkflowCheckpointState = z.infer<
  typeof WorkflowCheckpointStateSchema
>;

export const WorkflowNodeWaitKindSchema = z.enum([
  'async_batch',
  'human_decision',
  'retry_backoff',
  'checkpoint_commit',
]);
export type WorkflowNodeWaitKind = z.infer<typeof WorkflowNodeWaitKindSchema>;

export const WorkflowCorrectionArcTypeSchema = z.enum([
  'retry',
  'rollback',
  'reprompt',
  'resume',
]);
export type WorkflowCorrectionArcType = z.infer<
  typeof WorkflowCorrectionArcTypeSchema
>;

export const WorkflowExternalEffectStatusSchema = z.enum([
  'none',
  'idempotent',
  'compensatable',
  'unknown_external_effect',
]);
export type WorkflowExternalEffectStatus = z.infer<
  typeof WorkflowExternalEffectStatusSchema
>;

export const WorkflowTransitionInputSchema = z.object({
  reasonCode: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  occurredAt: z.string().datetime().optional(),
});
export type WorkflowTransitionInput = z.infer<
  typeof WorkflowTransitionInputSchema
>;

export const WorkflowNodeWaitStateSchema = z.object({
  kind: WorkflowNodeWaitKindSchema,
  reasonCode: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)).min(1),
  requestedAt: z.string().datetime(),
  resumeToken: z.string().min(1).optional(),
  externalRef: z.string().min(1).optional(),
});
export type WorkflowNodeWaitState = z.infer<
  typeof WorkflowNodeWaitStateSchema
>;

export const WorkflowCorrectionArcSchema = z.object({
  id: z.string().uuid(),
  runId: WorkflowExecutionIdSchema,
  nodeDefinitionId: WorkflowNodeDefinitionIdSchema,
  type: WorkflowCorrectionArcTypeSchema,
  sourceAttempt: z.number().int().positive(),
  targetAttempt: z.number().int().positive().optional(),
  checkpointId: z.string().uuid().optional(),
  reasonCode: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)).min(1),
  occurredAt: z.string().datetime(),
});
export type WorkflowCorrectionArc = z.infer<
  typeof WorkflowCorrectionArcSchema
>;

export const WorkflowNodeAttemptSchema = z.object({
  attempt: z.number().int().positive(),
  status: WorkflowNodeRunStatusSchema,
  dispatchLineageId: WorkflowDispatchLineageIdSchema,
  governanceDecision: ConfidenceGovernanceEvaluationResultSchema,
  waitState: WorkflowNodeWaitStateSchema.optional(),
  sideEffectStatus: WorkflowExternalEffectStatusSchema,
  checkpointId: z.string().uuid().optional(),
  outputRef: z.string().min(1).optional(),
  selectedBranchKey: z.string().min(1).optional(),
  reasonCode: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)).min(1),
  startedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
});
export type WorkflowNodeAttempt = z.infer<typeof WorkflowNodeAttemptSchema>;

export const WorkflowNodeRunStateSchema = z.object({
  id: WorkflowNodeRunIdSchema,
  nodeDefinitionId: WorkflowNodeDefinitionIdSchema,
  status: WorkflowNodeRunStatusSchema,
  attempts: z.array(WorkflowNodeAttemptSchema).default([]),
  activeAttempt: z.number().int().positive().nullable(),
  latestGovernanceDecision: ConfidenceGovernanceEvaluationResultSchema.optional(),
  activeWaitState: WorkflowNodeWaitStateSchema.optional(),
  lastCommittedCheckpointId: z.string().uuid().optional(),
  selectedBranchKey: z.string().min(1).optional(),
  correctionArcs: z.array(WorkflowCorrectionArcSchema).default([]),
  reasonCode: z.string().min(1).optional(),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  lastDispatchLineageId: WorkflowDispatchLineageIdSchema.optional(),
  updatedAt: z.string().datetime(),
});
export type WorkflowNodeRunState = z.infer<typeof WorkflowNodeRunStateSchema>;

export const WorkflowRunTriggerContextSchema = z.object({
  triggerId: z.string().uuid(),
  triggerType: IngressTriggerTypeSchema,
  sourceId: z.string().min(1),
  workflowRef: z.string().min(1),
  workmodeId: WorkmodeIdSchema,
  idempotencyKey: z.string().min(1),
  dispatchRef: z.string().min(1),
  evidenceRef: z.string().min(1),
  occurredAt: z.string().datetime(),
});
export type WorkflowRunTriggerContext = z.infer<
  typeof WorkflowRunTriggerContextSchema
>;

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
  activeNodeIds: z.array(WorkflowNodeDefinitionIdSchema).default([]),
  activatedEdgeIds: z.array(WorkflowEdgeIdSchema).default([]),
  readyNodeIds: z.array(WorkflowNodeDefinitionIdSchema).default([]),
  waitingNodeIds: z.array(WorkflowNodeDefinitionIdSchema).default([]),
  blockedNodeIds: z.array(WorkflowNodeDefinitionIdSchema).default([]),
  completedNodeIds: z.array(WorkflowNodeDefinitionIdSchema).default([]),
  lastPreparedCheckpointId: z.string().uuid().optional(),
  lastCommittedCheckpointId: z.string().uuid().optional(),
  checkpointState: WorkflowCheckpointStateSchema.default('idle'),
  triggerContext: WorkflowRunTriggerContextSchema.optional(),
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

export const WorkflowNodeExecutionPayloadSchema = z
  .object({
    modelInput: z.unknown().optional(),
    toolParams: z.unknown().optional(),
    conditionResult: z.boolean().optional(),
    transformOutput: z.unknown().optional(),
    qualityGatePassed: z.boolean().optional(),
    humanDecision: z.enum(['approved', 'rejected']).optional(),
    outputRef: z.string().min(1).optional(),
    externalRef: z.string().min(1).optional(),
    selectedBranchKey: z.string().min(1).optional(),
    sideEffectStatus: WorkflowExternalEffectStatusSchema.optional(),
    checkpointCommitMode: z.enum(['immediate', 'deferred']).optional(),
    detail: z.record(z.unknown()).default({}),
  })
  .passthrough();
export type WorkflowNodeExecutionPayload = z.infer<
  typeof WorkflowNodeExecutionPayloadSchema
>;

export const WorkflowNodeContinuationActionSchema = z.enum([
  'complete',
  'retry',
  'rollback',
  'reprompt',
  'resume',
  'reject',
]);
export type WorkflowNodeContinuationAction = z.infer<
  typeof WorkflowNodeContinuationActionSchema
>;

export const WorkflowExecuteNodeRequestSchema = z.object({
  executionId: WorkflowExecutionIdSchema,
  nodeDefinitionId: WorkflowNodeDefinitionIdSchema,
  controlState: ProjectControlStateSchema,
  governanceInput: ConfidenceGovernanceEvaluationInputSchema.optional(),
  payload: WorkflowNodeExecutionPayloadSchema.optional(),
  transition: WorkflowTransitionInputSchema,
});
export type WorkflowExecuteNodeRequest = z.infer<
  typeof WorkflowExecuteNodeRequestSchema
>;

export const WorkflowContinueNodeRequestSchema = z.object({
  executionId: WorkflowExecutionIdSchema,
  nodeDefinitionId: WorkflowNodeDefinitionIdSchema,
  controlState: ProjectControlStateSchema,
  action: WorkflowNodeContinuationActionSchema.default('complete'),
  continuationToken: z.string().min(1).optional(),
  payload: WorkflowNodeExecutionPayloadSchema.optional(),
  transition: WorkflowTransitionInputSchema,
  checkpointId: z.string().uuid().optional(),
  witnessRef: z.string().min(1).optional(),
});
export type WorkflowContinueNodeRequest = z.infer<
  typeof WorkflowContinueNodeRequestSchema
>;

export interface WorkflowNodeExecutionContext {
  projectConfig: ProjectConfig;
  graph: DerivedWorkflowGraph;
  runState: WorkflowRunState;
  nodeDefinition: WorkflowNodeDefinition;
  dispatchLineage: WorkflowDispatchLineage;
  controlState: ProjectControlState;
  governanceInput: ConfidenceGovernanceEvaluationInput;
  governanceDecision: ConfidenceGovernanceEvaluationResult;
  payload?: WorkflowNodeExecutionPayload;
}

export interface WorkflowNodeExecutionResult {
  outcome: 'completed' | 'waiting' | 'blocked' | 'failed';
  governanceDecision: ConfidenceGovernanceEvaluationResult;
  waitState?: WorkflowNodeWaitState;
  correctionArc?: WorkflowCorrectionArc;
  sideEffectStatus: WorkflowExternalEffectStatus;
  outputRef?: string;
  checkpointId?: string;
  selectedBranchKey?: string;
  reasonCode: string;
  evidenceRefs: string[];
}

export interface IWorkflowNodeHandler {
  readonly nodeType: WorkflowNodeKind;
  execute(context: WorkflowNodeExecutionContext): Promise<WorkflowNodeExecutionResult>;
}

// Backward-compatible aliases for the previous placeholder names.
export const WorkflowGraphSchema = DerivedWorkflowGraphSchema;
export type WorkflowGraph = DerivedWorkflowGraph;

export const WorkflowStateSchema = WorkflowRunStateSchema;
export type WorkflowState = WorkflowRunState;
