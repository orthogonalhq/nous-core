/**
 * Agent gateway runtime contract types for Nous-OSS.
 *
 * Phase 12.1 — canonical AgentGateway execution harness, budgets,
 * inter-gateway messaging, and result-only parent/child boundaries.
 */
import { z } from 'zod';
import { EscalationPrioritySchema } from './enums.js';
import {
  ProjectIdSchema,
  TraceIdSchema,
  WorkflowExecutionIdSchema,
  WorkflowNodeDefinitionIdSchema,
} from './ids.js';
import { TraceEvidenceReferenceSchema } from './evidence.js';
import { ModelRequirementsSchema } from './routing.js';
import { WorkmodeIdSchema } from './workmode.js';

const brandedGatewayId = <T extends string>(brand: T) =>
  z.string().uuid().brand(brand);

export const AgentClassSchema = z.enum([
  'Cortex::Principal',
  'Cortex::System',
  'Orchestrator',
  'Worker',
]);
export type AgentClass = z.infer<typeof AgentClassSchema>;

export const DispatchTargetClassSchema = z.enum(['Orchestrator', 'Worker']);
export type DispatchTargetClass = z.infer<typeof DispatchTargetClassSchema>;

export const GatewayAgentIdSchema = brandedGatewayId('GatewayAgentId');
export type GatewayAgentId = z.infer<typeof GatewayAgentIdSchema>;

export const GatewayRunIdSchema = brandedGatewayId('GatewayRunId');
export type GatewayRunId = z.infer<typeof GatewayRunIdSchema>;

export const GatewayMessageIdSchema = brandedGatewayId('GatewayMessageId');
export type GatewayMessageId = z.infer<typeof GatewayMessageIdSchema>;

export const GatewayBudgetSchema = z
  .object({
    maxTurns: z.number().int().positive(),
    maxTokens: z.number().int().positive(),
    timeoutMs: z.number().int().positive(),
  })
  .strict();
export type GatewayBudget = z.infer<typeof GatewayBudgetSchema>;

export const GatewayBudgetOverrideSchema = GatewayBudgetSchema.partial().strict();
export type GatewayBudgetOverride = z.infer<typeof GatewayBudgetOverrideSchema>;

export const GatewayBudgetUsageSchema = z
  .object({
    turnsUsed: z.number().int().nonnegative(),
    tokensUsed: z.number().int().nonnegative(),
    elapsedMs: z.number().int().nonnegative(),
    spawnUnitsUsed: z.number().int().nonnegative(),
  })
  .strict();
export type GatewayBudgetUsage = z.infer<typeof GatewayBudgetUsageSchema>;

export const GatewayBudgetExhaustionReasonSchema = z.enum([
  'turns',
  'tokens',
  'timeout',
  'spawn_budget',
]);
export type GatewayBudgetExhaustionReason = z.infer<
  typeof GatewayBudgetExhaustionReasonSchema
>;

export const GatewayCorrelationSchema = z
  .object({
    runId: GatewayRunIdSchema,
    parentId: GatewayAgentIdSchema.optional(),
    sequence: z.number().int().nonnegative(),
  })
  .strict();
export type GatewayCorrelation = z.infer<typeof GatewayCorrelationSchema>;

export const GatewayExecutionContextSchema = z
  .object({
    projectId: ProjectIdSchema.optional(),
    executionId: WorkflowExecutionIdSchema.optional(),
    nodeDefinitionId: WorkflowNodeDefinitionIdSchema.optional(),
    traceId: TraceIdSchema.optional(),
    workmodeId: WorkmodeIdSchema.optional(),
  })
  .strict();
export type GatewayExecutionContext = z.infer<
  typeof GatewayExecutionContextSchema
>;

export const GatewayContextRoleSchema = z.enum([
  'system',
  'user',
  'assistant',
  'tool',
]);
export type GatewayContextRole = z.infer<typeof GatewayContextRoleSchema>;

export const GatewayContextSourceSchema = z.enum([
  'initial_payload',
  'initial_context',
  'model_output',
  'tool_result',
  'tool_error',
  'inbox',
  'runtime',
  'child_result',
]);
export type GatewayContextSource = z.infer<typeof GatewayContextSourceSchema>;

export const GatewayContextFrameSchema = z
  .object({
    role: GatewayContextRoleSchema,
    source: GatewayContextSourceSchema,
    content: z.string(),
    createdAt: z.string().datetime(),
    name: z.string().min(1).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();
export type GatewayContextFrame = z.infer<typeof GatewayContextFrameSchema>;

export const AgentInputSchema = z
  .object({
    taskInstructions: z.string().min(1),
    payload: z.unknown().optional(),
    context: z.array(GatewayContextFrameSchema).default([]),
    budget: GatewayBudgetSchema,
    spawnBudgetCeiling: z.number().int().nonnegative().default(0),
    correlation: GatewayCorrelationSchema,
    execution: GatewayExecutionContextSchema.optional(),
    modelRequirements: ModelRequirementsSchema.optional(),
  })
  .strict();
export type AgentInput = z.infer<typeof AgentInputSchema>;

export const GatewayToolCallSchema = z
  .object({
    name: z.string().min(1),
    params: z.unknown().optional(),
  })
  .strict();
export type GatewayToolCall = z.infer<typeof GatewayToolCallSchema>;

export const GatewayAbortMessageSchema = z
  .object({
    type: z.literal('abort'),
    messageId: GatewayMessageIdSchema,
    reason: z.string().min(1),
    createdAt: z.string().datetime(),
  })
  .strict();
export type GatewayAbortMessage = z.infer<typeof GatewayAbortMessageSchema>;

export const GatewayInjectContextMessageSchema = z
  .object({
    type: z.literal('inject_context'),
    messageId: GatewayMessageIdSchema,
    frames: z.array(GatewayContextFrameSchema).min(1),
    createdAt: z.string().datetime(),
  })
  .strict();
export type GatewayInjectContextMessage = z.infer<
  typeof GatewayInjectContextMessageSchema
>;

export const GatewayInboxMessageSchema = z.discriminatedUnion('type', [
  GatewayAbortMessageSchema,
  GatewayInjectContextMessageSchema,
]);
export type GatewayInboxMessage = z.infer<typeof GatewayInboxMessageSchema>;

export const GatewayObservationSchema = z
  .object({
    observationType: z.string().min(1),
    content: z.string().min(1),
    detail: z.record(z.unknown()).default({}),
  })
  .strict();
export type GatewayObservation = z.infer<typeof GatewayObservationSchema>;

export const GatewayTurnAckEventSchema = z
  .object({
    type: z.literal('turn_ack'),
    eventId: GatewayMessageIdSchema,
    turn: z.number().int().positive(),
    correlation: GatewayCorrelationSchema,
    usage: GatewayBudgetUsageSchema,
    emittedAt: z.string().datetime(),
  })
  .strict();
export type GatewayTurnAckEvent = z.infer<typeof GatewayTurnAckEventSchema>;

export const GatewayObservationEventSchema = z
  .object({
    type: z.literal('observation'),
    eventId: GatewayMessageIdSchema,
    observation: GatewayObservationSchema,
    correlation: GatewayCorrelationSchema,
    usage: GatewayBudgetUsageSchema,
    emittedAt: z.string().datetime(),
  })
  .strict();
export type GatewayObservationEvent = z.infer<
  typeof GatewayObservationEventSchema
>;

export const GatewayOutboxEventSchema = z.discriminatedUnion('type', [
  GatewayTurnAckEventSchema,
  GatewayObservationEventSchema,
]);
export type GatewayOutboxEvent = z.infer<typeof GatewayOutboxEventSchema>;

export const GatewayDispatchRequestSchema = z
  .object({
    targetClass: DispatchTargetClassSchema,
    taskInstructions: z.string().min(1),
    payload: z.unknown().optional(),
    budget: GatewayBudgetOverrideSchema.optional(),
    nodeDefinitionId: WorkflowNodeDefinitionIdSchema.optional(),
  })
  .strict();
export type GatewayDispatchRequest = z.infer<
  typeof GatewayDispatchRequestSchema
>;

export const GatewayTaskCompletionRequestSchema = z
  .object({
    output: z.unknown(),
    artifactRefs: z.array(z.string().min(1)).default([]),
    summary: z.string().min(1).optional(),
  })
  .strict();
export type GatewayTaskCompletionRequest = z.infer<
  typeof GatewayTaskCompletionRequestSchema
>;

export const GatewayEscalationRequestSchema = z
  .object({
    reason: z.string().min(1),
    severity: EscalationPrioritySchema,
    detail: z.record(z.unknown()).default({}),
    contextSnapshot: z.string().min(1).optional(),
  })
  .strict();
export type GatewayEscalationRequest = z.infer<
  typeof GatewayEscalationRequestSchema
>;

const GatewayPacketEndpointSchema = z
  .object({
    id: z.string().regex(/^[^:]+::[^:]+::[^:]+::[^:]+$/),
    instance_id: z.string().uuid().optional(),
  })
  .strict();

const GatewayPacketPayloadSchema = z
  .object({
    schema: z.string().min(1),
    artifact_type: z.string().min(1),
    data: z.unknown().optional(),
  })
  .strict();

const GatewayPacketRetrySchema = z
  .object({
    policy: z.literal('value-proportional'),
    depth: z.enum(['lightweight', 'iterative']),
    importance_tier: z.enum(['standard', 'high', 'critical']),
    expected_quality_gain: z.union([z.number().min(0).max(1), z.string().min(1)]),
    estimated_tokens: z.union([z.number().int().nonnegative(), z.string().min(1)]),
    estimated_compute_minutes: z.union([z.number().nonnegative(), z.string().min(1)]),
    token_price_ref: z.string().min(1),
    compute_price_ref: z.string().min(1),
    decision: z.enum(['continue', 'accept', 'escalate', 'abort']),
    decision_log_ref: z.string().min(1),
    benchmark_tier: z.enum(['nightly', 'weekly', 'monthly', 'n/a']),
    self_repair: z
      .object({
        required_on_fail_close: z.literal(true),
        orchestration_state: z.literal('deferred'),
        approval_role: z.string().min(1),
        implementation_mode: z.enum(['direct', 'dispatch-team']),
        plan_ref: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export const GatewayStampedPacketSchema = z
  .object({
    nous: z
      .object({
        v: z.literal(3),
      })
      .strict(),
    route: z
      .object({
        emitter: GatewayPacketEndpointSchema,
        target: GatewayPacketEndpointSchema,
      })
      .strict(),
    envelope: z
      .object({
        direction: z.enum(['egress', 'ingress', 'internal']),
        type: z.enum(['dispatch', 'handoff', 'response_packet']),
      })
      .strict(),
    correlation: z
      .object({
        handoff_id: z.string().min(1),
        correlation_id: z.string().min(1),
        cycle: z.union([z.string().min(1), z.number().int().nonnegative()]),
        emitted_at_utc: z.string().datetime(),
        emitted_at_unix_ms: z.string().regex(/^\d+$/),
        sequence_in_run: z.string().regex(/^\d+$/),
        emitted_at_unix_us: z.string().regex(/^\d+$/).optional(),
      })
      .strict(),
    payload: GatewayPacketPayloadSchema,
    retry: GatewayPacketRetrySchema,
    artifact_refs: z.array(z.string().min(1)).optional(),
    summary: z.string().min(1).optional(),
  })
  .strict();
export type GatewayStampedPacket = z.infer<typeof GatewayStampedPacketSchema>;

export const GatewayRunSnapshotSchema = z
  .object({
    agentId: GatewayAgentIdSchema,
    agentClass: AgentClassSchema,
    correlation: GatewayCorrelationSchema,
    budget: GatewayBudgetSchema,
    usage: GatewayBudgetUsageSchema,
    startedAt: z.string().datetime(),
    lastUpdatedAt: z.string().datetime(),
    contextFrameCount: z.number().int().nonnegative(),
    execution: GatewayExecutionContextSchema.optional(),
  })
  .strict();
export type GatewayRunSnapshot = z.infer<typeof GatewayRunSnapshotSchema>;

const AgentResultBaseSchema = z
  .object({
    correlation: GatewayCorrelationSchema,
    usage: GatewayBudgetUsageSchema,
    evidenceRefs: z.array(TraceEvidenceReferenceSchema).default([]),
  })
  .strict();

export const AgentCompletedResultSchema = AgentResultBaseSchema.extend({
  status: z.literal('completed'),
  output: z.unknown(),
  v3Packet: GatewayStampedPacketSchema,
  summary: z.string().min(1).optional(),
  artifactRefs: z.array(z.string().min(1)).default([]),
}).strict();
export type AgentCompletedResult = z.infer<typeof AgentCompletedResultSchema>;

export const AgentEscalatedResultSchema = AgentResultBaseSchema.extend({
  status: z.literal('escalated'),
  reason: z.string().min(1),
  severity: EscalationPrioritySchema,
  detail: z.record(z.unknown()).default({}),
  contextSnapshot: z.string().min(1).optional(),
}).strict();
export type AgentEscalatedResult = z.infer<typeof AgentEscalatedResultSchema>;

export const AgentAbortedResultSchema = AgentResultBaseSchema.extend({
  status: z.literal('aborted'),
  reason: z.string().min(1),
}).strict();
export type AgentAbortedResult = z.infer<typeof AgentAbortedResultSchema>;

export const AgentBudgetExhaustedResultSchema = AgentResultBaseSchema.extend({
  status: z.literal('budget_exhausted'),
  exhausted: GatewayBudgetExhaustionReasonSchema,
  partialState: GatewayRunSnapshotSchema,
  turnsUsed: z.number().int().nonnegative(),
  tokensUsed: z.number().int().nonnegative(),
}).strict();
export type AgentBudgetExhaustedResult = z.infer<
  typeof AgentBudgetExhaustedResultSchema
>;

export const AgentErrorResultSchema = AgentResultBaseSchema.extend({
  status: z.literal('error'),
  reason: z.string().min(1),
  detail: z.record(z.unknown()).default({}),
}).strict();
export type AgentErrorResult = z.infer<typeof AgentErrorResultSchema>;

export const AgentResultSchema = z.discriminatedUnion('status', [
  AgentCompletedResultSchema,
  AgentEscalatedResultSchema,
  AgentAbortedResultSchema,
  AgentBudgetExhaustedResultSchema,
  AgentErrorResultSchema,
]);
export type AgentResult = z.infer<typeof AgentResultSchema>;
