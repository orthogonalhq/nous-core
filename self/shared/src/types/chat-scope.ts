/**
 * Chat scope resolution and event schemas for Nous-OSS.
 *
 * Phase 5.2 — Project-Chat-Cortex Control-Plane Runtime Binding.
 * Canonical source: project-chat-pfc-control-plane-canonical-architecture-v1.md
 */
import { z } from 'zod';
import { InvariantCodeSchema } from './evidence.js';

export const ScopeResolutionResultSchema = z.discriminatedUnion('resolved', [
  z.object({
    resolved: z.literal(true),
    project_id: z.string().uuid(),
    run_id: z.string().uuid().nullable(),
  }),
  z.object({
    resolved: z.literal(false),
    reasonCode: InvariantCodeSchema,
    evidenceRefs: z.array(z.string().min(1)).min(1),
  }),
]);
export type ScopeResolutionResult = z.infer<
  typeof ScopeResolutionResultSchema
>;

export const ChatEventTypeSchema = z.enum([
  'chat_turn_received',
  'chat_turn_scope_resolved',
  'chat_turn_scope_resolution_failed',
  'chat_turn_intent_classified',
  'chat_turn_policy_evaluated',
  'chat_turn_dispatch_requested',
  'chat_turn_dispatch_blocked',
  'chat_turn_control_command_generated',
  'chat_turn_control_command_blocked',
  'chat_turn_clarification_requested',
  'chat_turn_response_emitted',
  'chat_turn_closed',
  'chat_thread_created',
  'chat_thread_bind_requested',
  'chat_thread_bound',
  'chat_thread_bind_blocked',
  'chat_thread_priority_changed',
  'chat_digest_emitted',
  'chat_node_context_projected',
  'chat_node_thread_promotion_requested',
  'chat_node_thread_promoted',
  'chat_node_thread_promotion_blocked',
  'chat_node_reasoning_log_emitted',
  'chat_node_reasoning_log_redacted',
]);
export type ChatEventType = z.infer<typeof ChatEventTypeSchema>;
