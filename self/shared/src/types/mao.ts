/**
 * MAO (Multi-Agent Observability) projection types for Nous-OSS.
 *
 * Phase 9.7 expands the baseline projection shapes into the canonical
 * density-grid, graph, inspect, and project-control contracts used by
 * the MAO operating surface.
 */
import { z } from 'zod';
import {
  ProjectIdSchema,
  TraceIdSchema,
  WorkflowDispatchLineageIdSchema,
  WorkflowExecutionIdSchema,
  WorkflowNodeDefinitionIdSchema,
} from './ids.js';
import { NodeReasoningLogClassSchema } from './chat-node-context.js';
import { AgentClassSchema } from './agent-gateway.js';

/**
 * Sentinel project ID for system-scoped agents (Cortex::Principal, Cortex::System).
 * These agents are not project-scoped but MaoAgentProjectionSchema requires a valid UUID.
 * Uses the RFC 4122 nil UUID which will never collide with crypto.randomUUID().
 */
export const SYSTEM_SCOPE_SENTINEL_PROJECT_ID = '00000000-0000-0000-0000-000000000000';

export const MaoDensityModeSchema = z.enum(['D0', 'D1', 'D2', 'D3', 'D4']);
export type MaoDensityMode = z.infer<typeof MaoDensityModeSchema>;

export const ProjectControlStateSchema = z.enum([
  'running',
  'paused_review',
  'hard_stopped',
  'resuming',
]);
export type ProjectControlState = z.infer<typeof ProjectControlStateSchema>;

export const MaoProjectControlActionSchema = z.enum([
  'pause_project',
  'resume_project',
  'hard_stop_project',
]);
export type MaoProjectControlAction = z.infer<
  typeof MaoProjectControlActionSchema
>;

export const MaoAgentLifecycleStateSchema = z.enum([
  'queued',
  'ready',
  'running',
  'waiting_pfc',
  'waiting_async',
  'blocked',
  'failed',
  'completed',
  'paused',
  'resuming',
  'canceled',
  'hard_stopped',
]);
export type MaoAgentLifecycleState = z.infer<
  typeof MaoAgentLifecycleStateSchema
>;

export const MaoUrgencyLevelSchema = z.enum(['normal', 'elevated', 'urgent']);
export type MaoUrgencyLevel = z.infer<typeof MaoUrgencyLevelSchema>;

export const MaoSurfaceLinkTargetSchema = z.enum([
  'chat',
  'projects',
  'traces',
  'artifact',
  'mao',
  'mobile',
]);
export type MaoSurfaceLinkTarget = z.infer<typeof MaoSurfaceLinkTargetSchema>;

export const MaoSurfaceLinkSchema = z.object({
  target: MaoSurfaceLinkTargetSchema,
  projectId: ProjectIdSchema,
  workflowRunId: WorkflowExecutionIdSchema.optional(),
  nodeDefinitionId: WorkflowNodeDefinitionIdSchema.optional(),
  artifactRef: z.string().min(1).optional(),
  traceId: TraceIdSchema.optional(),
  dispatchLineageId: WorkflowDispatchLineageIdSchema.optional(),
  evidenceRef: z.string().min(1).optional(),
});
export type MaoSurfaceLink = z.infer<typeof MaoSurfaceLinkSchema>;

export const MaoReasoningLogPreviewSchema = z.object({
  class: NodeReasoningLogClassSchema,
  summary: z.string().min(1),
  evidenceRef: z.string().min(1),
  artifactRefs: z.array(z.string().min(1)).default([]),
  redactionClass: z.enum(['public_operator', 'restricted']),
  previewMode: z.enum(['inline', 'inspect_only']),
  emittedAt: z.string().datetime(),
  chatLink: MaoSurfaceLinkSchema.optional(),
  projectsLink: MaoSurfaceLinkSchema.optional(),
});
export type MaoReasoningLogPreview = z.infer<
  typeof MaoReasoningLogPreviewSchema
>;

export const MaoAgentProjectionSchema = z.object({
  agent_id: z.string().uuid(),
  project_id: ProjectIdSchema,
  workflow_run_id: WorkflowExecutionIdSchema.optional(),
  workflow_node_definition_id: WorkflowNodeDefinitionIdSchema.optional(),
  task_definition_id: z.string().uuid().optional(),
  task_name: z.string().optional(),
  dispatching_task_agent_id: z.string().uuid().nullable(),
  dispatch_origin_ref: z.string().min(1),
  agent_class: AgentClassSchema.optional(),
  display_name: z.string().optional(),
  state: MaoAgentLifecycleStateSchema,
  state_reason: z.string().min(1).optional(),
  state_reason_code: z.string().min(1).optional(),
  current_step: z.string().min(1),
  progress_percent: z.number().min(0).max(100),
  risk_level: z.enum(['low', 'medium', 'high', 'critical']),
  urgency_level: MaoUrgencyLevelSchema,
  attention_level: z.enum(['none', 'low', 'medium', 'high', 'urgent']),
  pfc_alert_status: z.string().min(1),
  pfc_mitigation_status: z.string().min(1),
  dispatch_state: z.string().min(1),
  reflection_cycle_count: z.number().int().nonnegative(),
  last_correction_action: z
    .enum(['reflection_review', 'retry', 'rollback', 'reprompt', 'resume'])
    .optional(),
  last_correction_reason: z.string().min(1).optional(),
  last_update_at: z.string().datetime(),
  reasoning_log_preview: MaoReasoningLogPreviewSchema.nullable(),
  reasoning_log_last_entry_class: NodeReasoningLogClassSchema.nullable().default(
    null,
  ),
  reasoning_log_last_entry_at: z.string().datetime().nullable().default(null),
  reasoning_log_redaction_state: z.enum(['none', 'partial', 'restricted']),
  deepLinks: z.array(MaoSurfaceLinkSchema).default([]),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  inference_provider_id: z.string().optional(),
  inference_model_id: z.string().optional(),
  inference_latency_ms: z.number().nonnegative().optional(),
  inference_total_tokens: z.number().int().nonnegative().optional(),
  inference_is_streaming: z.boolean().optional(),
});
export type MaoAgentProjection = z.infer<typeof MaoAgentProjectionSchema>;

export const MaoGridTileProjectionSchema = z.object({
  agent: MaoAgentProjectionSchema,
  densityMode: MaoDensityModeSchema,
  clusterKey: z.string().min(1).optional(),
  inspectOnly: z.boolean(),
  showUrgentOverlay: z.boolean(),
});
export type MaoGridTileProjection = z.infer<typeof MaoGridTileProjectionSchema>;

export const MaoRunGraphNodeSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['agent', 'review_gate', 'control_event']),
  agentId: z.string().uuid().optional(),
  workflowRunId: WorkflowExecutionIdSchema.optional(),
  workflowNodeDefinitionId: WorkflowNodeDefinitionIdSchema.optional(),
  label: z.string().min(1),
  state: MaoAgentLifecycleStateSchema.optional(),
  evidenceRefs: z.array(z.string().min(1)).default([]),
});
export type MaoRunGraphNode = z.infer<typeof MaoRunGraphNodeSchema>;

export const MaoRunGraphEdgeKindSchema = z.enum([
  'dispatch',
  'reflection_review',
  'retry',
  'rollback',
  'reprompt',
  'resume',
]);
export type MaoRunGraphEdgeKind = z.infer<typeof MaoRunGraphEdgeKindSchema>;

export const MaoRunGraphEdgeSchema = z.object({
  id: z.string().min(1),
  kind: MaoRunGraphEdgeKindSchema,
  fromNodeId: z.string().min(1),
  toNodeId: z.string().min(1),
  dispatchLineageId: WorkflowDispatchLineageIdSchema.optional(),
  reasonCode: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)).min(1),
  occurredAt: z.string().datetime(),
});
export type MaoRunGraphEdge = z.infer<typeof MaoRunGraphEdgeSchema>;

export const MaoUrgentOverlaySchema = z.object({
  urgentAgentIds: z.array(z.string().uuid()).default([]),
  blockedAgentIds: z.array(z.string().uuid()).default([]),
  generatedAt: z.string().datetime(),
});
export type MaoUrgentOverlay = z.infer<typeof MaoUrgentOverlaySchema>;

export const MaoResumeReadinessStatusSchema = z.enum([
  'not_applicable',
  'pending',
  'passed',
  'blocked',
]);
export type MaoResumeReadinessStatus = z.infer<
  typeof MaoResumeReadinessStatusSchema
>;

const MaoVoiceTurnStateSchema = z.enum([
  'listening',
  'evaluating',
  'awaiting_text_confirmation',
  'continuation_required',
  'completed',
  'blocked',
]);

const MaoVoiceAssistantOutputStateSchema = z.enum([
  'idle',
  'speaking',
  'interrupted_by_user',
  'awaiting_continuation',
  'completed',
]);

const MaoVoiceDegradedModeStateSchema = z.object({
  session_id: z.string().uuid(),
  project_id: ProjectIdSchema,
  active: z.boolean(),
  reason: z
    .enum([
      'low_asr_confidence',
      'low_intent_confidence',
      'handoff_instability',
      'transport_degraded',
      'barge_in_recovery_required',
    ])
    .optional(),
  entered_at: z.string().datetime().optional(),
  recovery_window_started_at: z.string().datetime().optional(),
  last_recovered_at: z.string().datetime().optional(),
  evidence_refs: z.array(z.string().min(1)).default([]),
});

const MaoVoiceConfirmationRequirementSchema = z.object({
  required: z.boolean(),
  confirmation_tier: z.enum(['T0', 'T1', 'T2', 'T3']).optional(),
  dual_channel_required: z.boolean(),
  active_principal_session_ref: z.string().min(1).optional(),
  text_surface_targets: z
    .array(z.enum(['chat', 'projects', 'mao', 'mobile']))
    .default([]),
  reason_code: z.string().min(1).optional(),
});

export const MaoProjectControlProjectionSchema = z.object({
  project_id: ProjectIdSchema,
  project_control_state: ProjectControlStateSchema,
  active_agent_count: z.number().int().nonnegative(),
  blocked_agent_count: z.number().int().nonnegative(),
  urgent_agent_count: z.number().int().nonnegative(),
  project_last_control_action: MaoProjectControlActionSchema.optional(),
  project_last_control_actor: z.string().min(1).optional(),
  project_last_control_reason: z.string().min(1).optional(),
  project_last_control_reason_code: z.string().min(1).optional(),
  project_last_control_at: z.string().datetime().optional(),
  resume_readiness_status: MaoResumeReadinessStatusSchema.default(
    'not_applicable',
  ),
  resume_readiness_reason_code: z.string().min(1).optional(),
  resume_readiness_evidence_refs: z.array(z.string().min(1)).default([]),
  pfc_project_review_status: z.enum(['none', 'pending', 'active', 'resolved']),
  pfc_project_recommendation: z.enum([
    'continue',
    'pause',
    'hard_stop',
    'resume_with_constraints',
  ]),
  voice_projection: z
    .object({
      current_turn_state: MaoVoiceTurnStateSchema,
      assistant_output_state: MaoVoiceAssistantOutputStateSchema,
      degraded_mode: MaoVoiceDegradedModeStateSchema,
      pending_confirmation: MaoVoiceConfirmationRequirementSchema,
      continuation_required: z.boolean(),
      updated_at: z.string().datetime(),
    })
    .optional(),
});
export type MaoProjectControlProjection = z.infer<
  typeof MaoProjectControlProjectionSchema
>;

export const MaoProjectSnapshotSummarySchema = z.object({
  activeAgentCount: z.number().int().min(0),
  blockedAgentCount: z.number().int().min(0),
  failedAgentCount: z.number().int().min(0),
  waitingPfcAgentCount: z.number().int().min(0),
  urgentAgentCount: z.number().int().min(0),
});
export type MaoProjectSnapshotSummary = z.infer<
  typeof MaoProjectSnapshotSummarySchema
>;

export const MaoProjectSnapshotDiagnosticsSchema = z.object({
  runtimePosture: z.literal('single_process_local'),
  degradedReasonCode: z.string().min(1).optional(),
});
export type MaoProjectSnapshotDiagnostics = z.infer<
  typeof MaoProjectSnapshotDiagnosticsSchema
>;

export const MaoProjectSnapshotInputSchema = z.object({
  projectId: ProjectIdSchema,
  densityMode: MaoDensityModeSchema.default('D2'),
  workflowRunId: WorkflowExecutionIdSchema.optional(),
});
export type MaoProjectSnapshotInput = z.infer<
  typeof MaoProjectSnapshotInputSchema
>;

export const MaoSystemSnapshotInputSchema = z.object({
  densityMode: MaoDensityModeSchema.default('D2'),
});
export type MaoSystemSnapshotInput = z.infer<typeof MaoSystemSnapshotInputSchema>;

export const MaoSystemSnapshotSchema = z.object({
  agents: z.array(MaoAgentProjectionSchema).default([]),
  leaseRoots: z.array(z.string().uuid()).default([]),
  projectControls: z.record(ProjectIdSchema, MaoProjectControlProjectionSchema).default({}),
  densityMode: MaoDensityModeSchema,
  generatedAt: z.string().datetime(),
});
export type MaoSystemSnapshot = z.infer<typeof MaoSystemSnapshotSchema>;

export const MaoRunGraphSnapshotSchema = z.object({
  projectId: ProjectIdSchema,
  workflowRunId: WorkflowExecutionIdSchema.optional(),
  nodes: z.array(MaoRunGraphNodeSchema).default([]),
  edges: z.array(MaoRunGraphEdgeSchema).default([]),
  generatedAt: z.string().datetime(),
});
export type MaoRunGraphSnapshot = z.infer<typeof MaoRunGraphSnapshotSchema>;

export const BudgetUtilizationSchema = z.object({
  utilizationPercent: z.number().nonnegative(),
  currentSpendUsd: z.number().nonnegative(),
  budgetCeilingUsd: z.number().nonnegative(),
  softAlertFired: z.boolean(),
  hardCeilingFired: z.boolean(),
});
export type BudgetUtilization = z.infer<typeof BudgetUtilizationSchema>;

export const MaoProjectSnapshotSchema = z.object({
  projectId: ProjectIdSchema,
  densityMode: MaoDensityModeSchema,
  workflowRunId: WorkflowExecutionIdSchema.optional(),
  controlProjection: MaoProjectControlProjectionSchema,
  grid: z.array(MaoGridTileProjectionSchema).default([]),
  graph: MaoRunGraphSnapshotSchema,
  urgentOverlay: MaoUrgentOverlaySchema,
  summary: MaoProjectSnapshotSummarySchema,
  diagnostics: MaoProjectSnapshotDiagnosticsSchema,
  budgetUtilization: BudgetUtilizationSchema.optional(),
  generatedAt: z.string().datetime(),
});
export type MaoProjectSnapshot = z.infer<typeof MaoProjectSnapshotSchema>;

export const MaoAgentInspectInputSchema = z
  .object({
    projectId: ProjectIdSchema,
    agentId: z.string().uuid().optional(),
    workflowRunId: WorkflowExecutionIdSchema.optional(),
    nodeDefinitionId: WorkflowNodeDefinitionIdSchema.optional(),
  })
  .refine(
    (value) =>
      value.agentId != null ||
      value.workflowRunId != null ||
      value.nodeDefinitionId != null,
    {
      message: 'An inspect target is required',
    },
  );
export type MaoAgentInspectInput = z.infer<typeof MaoAgentInspectInputSchema>;

export const MaoAgentInspectWaitKindSchema = z.enum([
  'async_batch',
  'human_decision',
  'retry_backoff',
  'checkpoint_commit',
]);
export type MaoAgentInspectWaitKind = z.infer<
  typeof MaoAgentInspectWaitKindSchema
>;

export const MaoCorrectionArcSummarySchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['retry', 'rollback', 'reprompt', 'resume']),
  sourceAttempt: z.number().int().positive(),
  targetAttempt: z.number().int().positive().optional(),
  checkpointId: z.string().uuid().optional(),
  reasonCode: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  occurredAt: z.string().datetime(),
});
export type MaoCorrectionArcSummary = z.infer<
  typeof MaoCorrectionArcSummarySchema
>;

export const MaoAgentAttemptSummarySchema = z.object({
  attempt: z.number().int().positive(),
  status: z.enum([
    'pending',
    'ready',
    'running',
    'waiting',
    'completed',
    'skipped',
    'blocked',
    'failed',
  ]),
  reasonCode: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
});
export type MaoAgentAttemptSummary = z.infer<
  typeof MaoAgentAttemptSummarySchema
>;

export const MaoAgentInspectProjectionSchema = z.object({
  projectId: ProjectIdSchema,
  workflowRunId: WorkflowExecutionIdSchema.optional(),
  workflowNodeDefinitionId: WorkflowNodeDefinitionIdSchema.optional(),
  agent: MaoAgentProjectionSchema,
  projectControlState: ProjectControlStateSchema,
  runStatus: z.string().min(1).optional(),
  waitKind: MaoAgentInspectWaitKindSchema.optional(),
  latestAttempt: MaoAgentAttemptSummarySchema.nullable(),
  correctionArcs: z.array(MaoCorrectionArcSummarySchema).default([]),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  inference_history: z.array(z.object({
    providerId: z.string(),
    modelId: z.string(),
    agentClass: z.string().optional(),
    traceId: z.string(),
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    latencyMs: z.number().nonnegative(),
    timestamp: z.string().datetime(),
  })).optional(),
  generatedAt: z.string().datetime(),
});
export type MaoAgentInspectProjection = z.infer<
  typeof MaoAgentInspectProjectionSchema
>;

export const MaoProjectControlImpactSummarySchema = z.object({
  activeRunCount: z.number().int().min(0),
  activeAgentCount: z.number().int().min(0),
  blockedAgentCount: z.number().int().min(0),
  urgentAgentCount: z.number().int().min(0),
  affectedScheduleCount: z.number().int().min(0),
  evidenceRefs: z.array(z.string().min(1)).default([]),
});
export type MaoProjectControlImpactSummary = z.infer<
  typeof MaoProjectControlImpactSummarySchema
>;

export const MaoProjectControlRequestSchema = z.object({
  command_id: z.string().uuid(),
  project_id: ProjectIdSchema,
  action: MaoProjectControlActionSchema,
  actor_id: z.string().min(1),
  actor_type: z.enum(['operator', 'nous_cortex']),
  reason: z.string().min(1),
  requested_at: z.string().datetime(),
  impactSummary: MaoProjectControlImpactSummarySchema,
});
export type MaoProjectControlRequest = z.infer<
  typeof MaoProjectControlRequestSchema
>;

export const MaoProjectControlResultSchema = z.object({
  command_id: z.string().uuid(),
  project_id: ProjectIdSchema,
  accepted: z.boolean(),
  status: z.enum(['applied', 'blocked', 'rejected']),
  from_state: ProjectControlStateSchema,
  to_state: ProjectControlStateSchema,
  reason_code: z.string().min(1),
  decision_ref: z.string().min(1),
  policy_ref: z.string().min(1).optional(),
  impactSummary: MaoProjectControlImpactSummarySchema,
  evidenceRefs: z.array(z.string().min(1)).default([]),
  readiness_status: MaoResumeReadinessStatusSchema.default('not_applicable'),
});
export type MaoProjectControlResult = z.infer<
  typeof MaoProjectControlResultSchema
>;

export const MaoEventTypeSchema = z.enum([
  'mao_agent_state_projected',
  'mao_density_mode_changed',
  'mao_urgent_overlay_applied',
  'mao_urgent_overlay_cleared',
  'mao_project_control_requested',
  'mao_project_control_applied',
  'mao_project_control_blocked',
  'mao_pfc_project_recommendation_updated',
  'mao_project_resume_readiness_passed',
  'mao_project_resume_readiness_blocked',
  'mao_graph_lineage_rendered',
]);
export type MaoEventType = z.infer<typeof MaoEventTypeSchema>;

export const MaoControlAuditHistoryEntrySchema = z.object({
  commandId: z.string().uuid(),
  action: MaoProjectControlActionSchema,
  actorId: z.string().min(1),
  reason: z.string().min(1),
  reasonCode: z.string().min(1),
  at: z.string().datetime(),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  resumeReadinessStatus: MaoResumeReadinessStatusSchema,
  decisionRef: z.string().min(1),
});
export type MaoControlAuditHistoryEntry = z.infer<
  typeof MaoControlAuditHistoryEntrySchema
>;

export const MaoControlAuditHistorySchema = z.object({
  projectId: ProjectIdSchema,
  entries: z.array(MaoControlAuditHistoryEntrySchema),
  totalCount: z.number().int().nonnegative(),
  cappedAt: z.number().int().positive(),
});
export type MaoControlAuditHistory = z.infer<
  typeof MaoControlAuditHistorySchema
>;
