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
}

/**
 * All valid channel names in the event bus.
 */
export type EventChannel = keyof EventChannelMap;
