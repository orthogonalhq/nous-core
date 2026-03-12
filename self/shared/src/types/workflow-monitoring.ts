/**
 * Projection contracts for the Projects UI workflow monitoring and editor surface.
 *
 * These shapes are read models over canonical project, workflow, runtime,
 * artifact, trace, and MAO projection truth.
 */
import { z } from 'zod';
import { ProjectIdentityContractSchema } from './project.js';
import {
  DerivedWorkflowGraphSchema,
  WorkflowCheckpointStateSchema,
  WorkflowDefinitionSchema,
  WorkflowEdgeDefinitionSchema,
  WorkflowNodeDefinitionSchema,
  WorkflowNodeRunStatusSchema,
  WorkflowNodeRunStateSchema,
  WorkflowRunStateSchema,
  WorkflowRunTriggerContextSchema,
} from './workflow.js';
import {
  ProjectIdSchema,
  TraceIdSchema,
  WorkflowDispatchLineageIdSchema,
  WorkflowExecutionIdSchema,
  WorkflowNodeDefinitionIdSchema,
} from './ids.js';
import { ArtifactVersionRecordSchema } from './artifacts.js';
import {
  MaoAgentInspectProjectionSchema,
  MaoProjectControlProjectionSchema,
  MaoRunGraphSnapshotSchema,
} from './mao.js';

export const WorkflowRuntimeAvailabilitySchema = z.enum([
  'live',
  'no_active_run',
  'degraded_runtime_unavailable',
]);
export type WorkflowRuntimeAvailability = z.infer<
  typeof WorkflowRuntimeAvailabilitySchema
>;

export const WorkflowSurfaceLinkTargetSchema = z.enum([
  'chat',
  'projects',
  'traces',
  'artifact',
  'mao',
]);
export type WorkflowSurfaceLinkTarget = z.infer<
  typeof WorkflowSurfaceLinkTargetSchema
>;

export const WorkflowSurfaceLinkSchema = z.object({
  target: WorkflowSurfaceLinkTargetSchema,
  projectId: ProjectIdSchema,
  workflowRunId: WorkflowExecutionIdSchema.optional(),
  nodeDefinitionId: WorkflowNodeDefinitionIdSchema.optional(),
  artifactRef: z.string().optional(),
  traceId: TraceIdSchema.optional(),
  dispatchLineageId: WorkflowDispatchLineageIdSchema.optional(),
  evidenceRef: z.string().optional(),
});
export type WorkflowSurfaceLink = z.infer<typeof WorkflowSurfaceLinkSchema>;

export const WorkflowTraceSummarySchema = z.object({
  traceId: TraceIdSchema,
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  turnCount: z.number().int().min(0),
});
export type WorkflowTraceSummary = z.infer<typeof WorkflowTraceSummarySchema>;

export const WorkflowNodeProjectionStatusSchema = z.enum([
  'pending',
  'ready',
  'running',
  'waiting',
  'completed',
  'skipped',
  'blocked',
  'failed',
  'degraded',
]);
export type WorkflowNodeProjectionStatus = z.infer<
  typeof WorkflowNodeProjectionStatusSchema
>;

export const WorkflowNodeMonitorProjectionSchema = z.object({
  nodeDefinitionId: WorkflowNodeDefinitionIdSchema,
  definition: WorkflowNodeDefinitionSchema,
  nodeState: WorkflowNodeRunStateSchema.nullable(),
  status: WorkflowNodeProjectionStatusSchema,
  groupKey: z.string().min(1),
  artifactRefs: z.array(z.string().min(1)).default([]),
  traceIds: z.array(TraceIdSchema).default([]),
  deepLinks: z.array(WorkflowSurfaceLinkSchema).default([]),
});
export type WorkflowNodeMonitorProjection = z.infer<
  typeof WorkflowNodeMonitorProjectionSchema
>;

export const WorkflowStageProjectionSchema = z.object({
  id: z.string().min(1),
  index: z.number().int().nonnegative(),
  label: z.string().min(1),
  nodeDefinitionIds: z.array(WorkflowNodeDefinitionIdSchema).default([]),
  kind: z.enum(['entry', 'execution', 'decision', 'review', 'terminal']),
});
export type WorkflowStageProjection = z.infer<
  typeof WorkflowStageProjectionSchema
>;

export const WorkflowCanvasNodeProjectionSchema = z.object({
  nodeDefinitionId: WorkflowNodeDefinitionIdSchema,
  definition: WorkflowNodeDefinitionSchema,
  stageId: z.string().min(1),
  column: z.number().int().nonnegative(),
  row: z.number().int().nonnegative(),
  status: WorkflowNodeProjectionStatusSchema,
  isEntry: z.boolean(),
  isActive: z.boolean(),
  latestAttemptStatus: WorkflowNodeRunStatusSchema.optional(),
  latestReasonCode: z.string().min(1).optional(),
  artifactCount: z.number().int().min(0),
  traceCount: z.number().int().min(0),
  deepLinks: z.array(WorkflowSurfaceLinkSchema).default([]),
});
export type WorkflowCanvasNodeProjection = z.infer<
  typeof WorkflowCanvasNodeProjectionSchema
>;

export const WorkflowCanvasEdgeProjectionSchema = z.object({
  edge: WorkflowEdgeDefinitionSchema,
  state: z.enum(['inactive', 'candidate', 'activated', 'blocked_path']),
  isBranchEdge: z.boolean(),
  branchKey: z.string().min(1).optional(),
  reasonCode: z.string().min(1).optional(),
});
export type WorkflowCanvasEdgeProjection = z.infer<
  typeof WorkflowCanvasEdgeProjectionSchema
>;

export const WorkflowCheckpointDebugSummarySchema = z.object({
  runCheckpointState: WorkflowCheckpointStateSchema,
  lastPreparedCheckpointId: z.string().uuid().optional(),
  lastCommittedCheckpointId: z.string().uuid().optional(),
});
export type WorkflowCheckpointDebugSummary = z.infer<
  typeof WorkflowCheckpointDebugSummarySchema
>;

export const WorkflowSchedulerDebugSummarySchema = z.object({
  triggerContext: WorkflowRunTriggerContextSchema.nullable(),
  enabledScheduleCount: z.number().int().min(0),
  overdueScheduleCount: z.number().int().min(0),
  evidenceRefs: z.array(z.string().min(1)).default([]),
});
export type WorkflowSchedulerDebugSummary = z.infer<
  typeof WorkflowSchedulerDebugSummarySchema
>;

export const WorkflowNodeInspectProjectionSchema = z.object({
  nodeDefinitionId: WorkflowNodeDefinitionIdSchema,
  monitor: WorkflowNodeMonitorProjectionSchema,
  maoInspect: MaoAgentInspectProjectionSchema.nullable(),
  checkpointSummary: WorkflowCheckpointDebugSummarySchema,
  artifactRefs: z.array(z.string().min(1)).default([]),
  traceIds: z.array(TraceIdSchema).default([]),
  policyReasonCode: z.string().min(1).optional(),
});
export type WorkflowNodeInspectProjection = z.infer<
  typeof WorkflowNodeInspectProjectionSchema
>;

export const WorkflowSurfaceDiagnosticsSchema = z.object({
  runtimePosture: z.literal('single_process_local'),
  degradedReasonCode: z.string().min(1).optional(),
  inspectFirstMode: z.enum(['protocol', 'intent', 'hybrid', 'no-definition']),
});
export type WorkflowSurfaceDiagnostics = z.infer<
  typeof WorkflowSurfaceDiagnosticsSchema
>;

export const WorkflowVisualDebugSnapshotSchema = z.object({
  project: ProjectIdentityContractSchema,
  workflowDefinition: WorkflowDefinitionSchema.nullable(),
  graph: DerivedWorkflowGraphSchema.nullable(),
  runtimeAvailability: WorkflowRuntimeAvailabilitySchema,
  selectedRunId: WorkflowExecutionIdSchema.optional(),
  activeRunState: WorkflowRunStateSchema.nullable(),
  recentRuns: z.array(WorkflowRunStateSchema).default([]),
  nodeProjections: z.array(WorkflowNodeMonitorProjectionSchema).default([]),
  stages: z.array(WorkflowStageProjectionSchema).default([]),
  canvasNodes: z.array(WorkflowCanvasNodeProjectionSchema).default([]),
  canvasEdges: z.array(WorkflowCanvasEdgeProjectionSchema).default([]),
  maoRunGraph: MaoRunGraphSnapshotSchema.nullable(),
  controlProjection: MaoProjectControlProjectionSchema.nullable(),
  checkpointSummary: WorkflowCheckpointDebugSummarySchema,
  schedulerSummary: WorkflowSchedulerDebugSummarySchema,
  recentArtifacts: z.array(ArtifactVersionRecordSchema).default([]),
  recentTraces: z.array(WorkflowTraceSummarySchema).default([]),
  diagnostics: WorkflowSurfaceDiagnosticsSchema.extend({
    graphProjectionParity: z.enum(['aligned', 'degraded']),
  }),
});
export type WorkflowVisualDebugSnapshot = z.infer<
  typeof WorkflowVisualDebugSnapshotSchema
>;

export const ProjectWorkflowSurfaceSnapshotSchema = z.object({
  project: ProjectIdentityContractSchema,
  workflowDefinition: WorkflowDefinitionSchema.nullable(),
  graph: DerivedWorkflowGraphSchema.nullable(),
  runtimeAvailability: WorkflowRuntimeAvailabilitySchema,
  selectedRunId: WorkflowExecutionIdSchema.optional(),
  activeRunState: WorkflowRunStateSchema.nullable(),
  recentRuns: z.array(WorkflowRunStateSchema).default([]),
  nodeProjections: z.array(WorkflowNodeMonitorProjectionSchema).default([]),
  recentArtifacts: z.array(ArtifactVersionRecordSchema).default([]),
  recentTraces: z.array(WorkflowTraceSummarySchema).default([]),
  controlProjection: MaoProjectControlProjectionSchema.nullable(),
  diagnostics: WorkflowSurfaceDiagnosticsSchema,
});
export type ProjectWorkflowSurfaceSnapshot = z.infer<
  typeof ProjectWorkflowSurfaceSnapshotSchema
>;

export const WorkflowEditorValidationIssueSchema = z.object({
  severity: z.enum(['error', 'warning']),
  code: z.string().min(1),
  message: z.string().min(1),
  path: z.array(z.string()).default([]),
});
export type WorkflowEditorValidationIssue = z.infer<
  typeof WorkflowEditorValidationIssueSchema
>;

export const WorkflowDefinitionValidationResultSchema = z.object({
  valid: z.boolean(),
  definition: WorkflowDefinitionSchema.nullable(),
  derivedGraph: DerivedWorkflowGraphSchema.nullable(),
  issues: z.array(WorkflowEditorValidationIssueSchema).default([]),
});
export type WorkflowDefinitionValidationResult = z.infer<
  typeof WorkflowDefinitionValidationResultSchema
>;

export const SaveWorkflowDefinitionInputSchema = z.object({
  projectId: ProjectIdSchema,
  workflowDefinition: WorkflowDefinitionSchema,
  setAsDefault: z.boolean().default(true),
});
export type SaveWorkflowDefinitionInput = z.infer<
  typeof SaveWorkflowDefinitionInputSchema
>;
