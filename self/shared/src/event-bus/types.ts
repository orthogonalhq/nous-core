/**
 * EventChannelMap — Typed channel registry for the Nous event bus.
 *
 * Each channel name follows the pattern `domain:action`. Payloads are
 * defined as Zod schemas with inferred TypeScript types, enabling both
 * compile-time type safety and optional runtime validation.
 *
 * This module is additive alongside the existing NousEvent discriminated
 * union (self/shared/src/events/). The two systems coexist: NousEvent
 * serves inter-layer tracing; EventChannelMap serves typed pub/sub for
 * UI-push via the event bus.
 */
import { z } from 'zod';
import type {
  CostEvent,
  BudgetAlertPayload,
  BudgetExceededPayload,
  CostSnapshotPayload,
} from '../types/cost.js';

// --- Health Domain ---

export const HealthBootStepPayloadSchema = z.object({
  step: z.string(),
  status: z.enum(['started', 'completed', 'failed']),
});
export type HealthBootStepPayload = z.infer<typeof HealthBootStepPayloadSchema>;

export const HealthGatewayStatusPayloadSchema = z.object({
  status: z.enum(['booting', 'booted', 'degraded', 'error']),
});
export type HealthGatewayStatusPayload = z.infer<typeof HealthGatewayStatusPayloadSchema>;

export const HealthIssuePayloadSchema = z.object({
  issueId: z.string(),
  severity: z.enum(['info', 'warning', 'error', 'critical']),
  message: z.string(),
});
export type HealthIssuePayload = z.infer<typeof HealthIssuePayloadSchema>;

export const HealthBacklogAnalyticsPayloadSchema = z.object({
  pending: z.number(),
  inProgress: z.number(),
  completed: z.number(),
});
export type HealthBacklogAnalyticsPayload = z.infer<typeof HealthBacklogAnalyticsPayloadSchema>;

// --- App-Health Domain ---

export const AppHealthChangePayloadSchema = z.object({
  appId: z.string(),
  sessionId: z.string(),
  status: z.enum(['healthy', 'degraded', 'stale', 'disconnected']),
});
export type AppHealthChangePayload = z.infer<typeof AppHealthChangePayloadSchema>;

export const AppHealthHeartbeatPayloadSchema = z.object({
  appId: z.string(),
  sessionId: z.string(),
  timestamp: z.string().datetime(),
});
export type AppHealthHeartbeatPayload = z.infer<typeof AppHealthHeartbeatPayloadSchema>;

// --- MAO Domain ---

export const MaoProjectionChangedPayloadSchema = z.object({
  projectId: z.string().optional(),
  snapshotVersion: z.number().optional(),
});
export type MaoProjectionChangedPayload = z.infer<typeof MaoProjectionChangedPayloadSchema>;

export const MaoControlActionPayloadSchema = z.object({
  projectId: z.string(),
  action: z.string(),
  result: z.enum(['success', 'failure']),
});
export type MaoControlActionPayload = z.infer<typeof MaoControlActionPayloadSchema>;

// --- Voice Domain ---

export const VoiceStateChangePayloadSchema = z.object({
  turnId: z.string(),
  state: z.enum(['recording', 'evaluating', 'barge-in', 'continuation', 'idle']),
});
export type VoiceStateChangePayload = z.infer<typeof VoiceStateChangePayloadSchema>;

export const VoiceTranscriptionPayloadSchema = z.object({
  turnId: z.string(),
  transcript: z.string(),
});
export type VoiceTranscriptionPayload = z.infer<typeof VoiceTranscriptionPayloadSchema>;

// --- Lifecycle Domain ---

export const LifecycleTransitionPayloadSchema = z.object({
  packageId: z.string(),
  fromState: z.string(),
  toState: z.string(),
  transitionType: z.string(),
});
export type LifecycleTransitionPayload = z.infer<typeof LifecycleTransitionPayloadSchema>;

// --- Escalation Domain ---

export const EscalationNewPayloadSchema = z.object({
  escalationId: z.string(),
  projectId: z.string().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  message: z.string(),
});
export type EscalationNewPayload = z.infer<typeof EscalationNewPayloadSchema>;

export const EscalationResolvedPayloadSchema = z.object({
  escalationId: z.string(),
  resolution: z.enum(['acknowledged', 'resolved', 'dismissed']),
});
export type EscalationResolvedPayload = z.infer<typeof EscalationResolvedPayloadSchema>;

// --- System Domain ---

export const SystemBacklogChangePayloadSchema = z.object({
  pending: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  suspended: z.number().int().nonnegative(),
  pressureTrend: z.enum(['increasing', 'stable', 'decreasing']),
});
export type SystemBacklogChangePayload = z.infer<typeof SystemBacklogChangePayloadSchema>;

export const SystemTurnAckPayloadSchema = z.object({
  agentClass: z.enum(['Cortex::Principal', 'Cortex::System']),
  turn: z.number().int().positive(),
  runId: z.string().min(1),
  turnsUsed: z.number().int().nonnegative(),
  tokensUsed: z.number().int().nonnegative(),
  emittedAt: z.string().datetime(),
});
export type SystemTurnAckPayload = z.infer<typeof SystemTurnAckPayloadSchema>;

export const SystemOutboxEventPayloadSchema = z.object({
  agentClass: z.enum(['Cortex::Principal', 'Cortex::System']),
  type: z.literal('observation'),
  observationType: z.string(),
  content: z.string(),
  runId: z.string().min(1),
  emittedAt: z.string().datetime(),
});
export type SystemOutboxEventPayload = z.infer<typeof SystemOutboxEventPayloadSchema>;

// --- Thought Domain ---

export const ThoughtPfcDecisionPayloadSchema = z.object({
  traceId: z.string(),
  thoughtType: z.enum([
    'confidence-governance',
    'memory-write',
    'memory-mutation',
    'tool-execution',
    'reflection',
    'escalation',
  ]),
  decision: z.enum(['approved', 'denied', 'neutral']),
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string(),
  content: z.string(),
  sequence: z.number().int(),
  emittedAt: z.string().datetime(),
});
export type ThoughtPfcDecisionPayload = z.infer<typeof ThoughtPfcDecisionPayloadSchema>;

export const ThoughtTurnLifecyclePayloadSchema = z.object({
  traceId: z.string(),
  phase: z.enum([
    'turn-start',
    'opctl-check',
    'gateway-run',
    'response-resolved',
    'stm-finalize',
    'trace-record',
    'turn-complete',
  ]),
  status: z.enum(['started', 'completed', 'failed']),
  content: z.string().optional(),
  sequence: z.number().int(),
  emittedAt: z.string().datetime(),
});
export type ThoughtTurnLifecyclePayload = z.infer<typeof ThoughtTurnLifecyclePayloadSchema>;

// --- Inference Domain ---

export const InferenceCallCompletePayloadSchema = z.object({
  providerId: z.string(),
  modelId: z.string(),
  agentClass: z.string().optional(),
  traceId: z.string(),
  projectId: z.string().optional(),
  laneKey: z.string(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  latencyMs: z.number().nonnegative(),
  routingDecision: z.string().optional(),
  emittedAt: z.string().datetime(),
  correlationRunId: z.string().optional(),
  correlationParentId: z.string().optional(),
});
export type InferenceCallCompletePayload = z.infer<typeof InferenceCallCompletePayloadSchema>;

export const InferenceStreamCompletePayloadSchema = InferenceCallCompletePayloadSchema;
export type InferenceStreamCompletePayload = InferenceCallCompletePayload;

export const InferenceStreamStartPayloadSchema = z.object({
  providerId: z.string(),
  modelId: z.string(),
  agentClass: z.string().optional(),
  traceId: z.string(),
  projectId: z.string().optional(),
  laneKey: z.string(),
  emittedAt: z.string().datetime(),
});
export type InferenceStreamStartPayload = z.infer<typeof InferenceStreamStartPayloadSchema>;

// --- Chat Streaming Chunks (WR-152) ---

export const ChatThinkingChunkPayloadSchema = z.object({
  content: z.string(),
  traceId: z.string(),
});
export type ChatThinkingChunkPayload = z.infer<typeof ChatThinkingChunkPayloadSchema>;

export const ChatContentChunkPayloadSchema = z.object({
  content: z.string(),
  traceId: z.string(),
});
export type ChatContentChunkPayload = z.infer<typeof ChatContentChunkPayloadSchema>;

export const InferenceAccumulatorSnapshotPayloadSchema = z.object({
  totalInputTokens: z.number().int().nonnegative(),
  totalOutputTokens: z.number().int().nonnegative(),
  providerBreakdown: z.record(z.string(), z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    callCount: z.number().int().nonnegative(),
  })),
  windowStart: z.string().datetime(),
  emittedAt: z.string().datetime(),
});
export type InferenceAccumulatorSnapshotPayload = z.infer<typeof InferenceAccumulatorSnapshotPayloadSchema>;

// --- Workflow Domain ---

export const WorkflowNodeStatusChangedPayloadSchema = z.object({
  workflowRunId: z.string().uuid(),
  nodeId: z.string().uuid(),
  projectId: z.string().uuid(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'skipped']),
  emittedAt: z.string().datetime(),
});
export type WorkflowNodeStatusChangedPayload = z.infer<typeof WorkflowNodeStatusChangedPayloadSchema>;

export const WorkflowRunCompletedPayloadSchema = z.object({
  workflowRunId: z.string().uuid(),
  projectId: z.string().uuid(),
  outcome: z.enum(['completed', 'failed', 'cancelled']),
  emittedAt: z.string().datetime(),
});
export type WorkflowRunCompletedPayload = z.infer<typeof WorkflowRunCompletedPayloadSchema>;

export const WorkflowSpecUpdatedPayloadSchema = z.object({
  projectId: z.string(),
  definitionId: z.string(),
});
export type WorkflowSpecUpdatedPayload = z.infer<typeof WorkflowSpecUpdatedPayloadSchema>;

// --- Ollama Domain ---

/**
 * SSE payload for Ollama model pull progress.
 *
 * Extends the shape of OllamaModelPullProgress from ollama-detection.ts
 * with a `model` field so the UI can correlate progress events to the
 * model being pulled.
 */
export const OllamaPullProgressPayloadSchema = z.object({
  model: z.string(),
  status: z.string(),
  digest: z.string().optional(),
  total: z.number().optional(),
  completed: z.number().optional(),
  percent: z.number().optional(),
});
export type OllamaPullProgressPayload = z.infer<typeof OllamaPullProgressPayloadSchema>;

/**
 * SSE payload for Ollama install progress.
 * Tracks discrete installation phases (not fake percentages) per RT-2.
 */
export const OllamaInstallProgressPayloadSchema = z.object({
  phase: z.enum(['downloading', 'installing', 'verifying', 'complete', 'error']),
  message: z.string().optional(),
});
export type OllamaInstallProgressPayload = z.infer<typeof OllamaInstallProgressPayloadSchema>;

/**
 * SSE payload for Ollama update progress.
 * Tracks discrete update phases with optional version metadata.
 */
export const OllamaUpdateProgressPayloadSchema = z.object({
  phase: z.enum(['checking', 'downloading', 'installing', 'verifying', 'complete', 'error']),
  currentVersion: z.string().optional(),
  targetVersion: z.string().optional(),
  message: z.string().optional(),
});
export type OllamaUpdateProgressPayload = z.infer<typeof OllamaUpdateProgressPayloadSchema>;

/**
 * SSE payload for Ollama version info.
 * Reports detected version and minimum-version compliance.
 */
export const OllamaVersionInfoPayloadSchema = z.object({
  version: z.string(),
  meetsMinimum: z.boolean(),
  minimumVersion: z.string().optional(),
});
export type OllamaVersionInfoPayload = z.infer<typeof OllamaVersionInfoPayloadSchema>;

// --- Notification Domain ---

export const NotificationRaisedPayloadSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['escalation', 'alert', 'health', 'panel', 'toast']),
  projectId: z.string().min(1).nullable(),
  level: z.enum(['info', 'warning', 'error', 'critical']),
  title: z.string().min(1),
  source: z.string().min(1),
});
export type NotificationRaisedPayload = z.infer<typeof NotificationRaisedPayloadSchema>;

export const NotificationUpdatedPayloadSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['active', 'acknowledged', 'dismissed']),
  previousStatus: z.enum(['active', 'acknowledged', 'dismissed']),
});
export type NotificationUpdatedPayload = z.infer<typeof NotificationUpdatedPayloadSchema>;

// --- Channel Map ---

export interface EventChannelMap {
  'health:boot-step': HealthBootStepPayload;
  'health:gateway-status': HealthGatewayStatusPayload;
  'health:issue': HealthIssuePayload;
  'health:backlog-analytics': HealthBacklogAnalyticsPayload;
  'app-health:change': AppHealthChangePayload;
  'app-health:heartbeat': AppHealthHeartbeatPayload;
  'mao:projection-changed': MaoProjectionChangedPayload;
  'mao:control-action': MaoControlActionPayload;
  'voice:state-change': VoiceStateChangePayload;
  'voice:transcription': VoiceTranscriptionPayload;
  'lifecycle:transition': LifecycleTransitionPayload;
  'escalation:new': EscalationNewPayload;
  'escalation:resolved': EscalationResolvedPayload;
  'system:backlog-change': SystemBacklogChangePayload;
  'system:outbox-event': SystemOutboxEventPayload;
  'system:turn-ack': SystemTurnAckPayload;
  'thought:pfc-decision': ThoughtPfcDecisionPayload;
  'thought:turn-lifecycle': ThoughtTurnLifecyclePayload;
  'inference:call-complete': InferenceCallCompletePayload;
  'inference:stream-start': InferenceStreamStartPayload;
  'inference:stream-complete': InferenceStreamCompletePayload;
  'inference:accumulator-snapshot': InferenceAccumulatorSnapshotPayload;
  'workflow:node-status-changed': WorkflowNodeStatusChangedPayload;
  'workflow:run-completed': WorkflowRunCompletedPayload;
  'workflow:spec-updated': WorkflowSpecUpdatedPayload;
  'cost:event-recorded': CostEvent;
  'cost:budget-alert': BudgetAlertPayload;
  'cost:budget-exceeded': BudgetExceededPayload;
  'cost:snapshot': CostSnapshotPayload;
  'ollama:pull-progress': OllamaPullProgressPayload;
  'ollama:install-progress': OllamaInstallProgressPayload;
  'ollama:update-progress': OllamaUpdateProgressPayload;
  'ollama:version-info': OllamaVersionInfoPayload;
  'notification:raised': NotificationRaisedPayload;
  'notification:updated': NotificationUpdatedPayload;
  'chat:thinking-chunk': ChatThinkingChunkPayload;
  'chat:content-chunk': ChatContentChunkPayload;
}

/**
 * All valid channel names in the event bus.
 */
export type EventChannel = keyof EventChannelMap;
