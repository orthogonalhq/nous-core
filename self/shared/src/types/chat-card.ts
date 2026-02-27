/**
 * Chat card and bind command schemas for Nous-OSS.
 *
 * Phase 5.2 — Project-Chat-Cortex Control-Plane Runtime Binding.
 * Canonical source: project-chat-pfc-control-plane-canonical-architecture-v1.md
 */
import { z } from 'zod';
import { ChatThreadBindingKindSchema } from './chat-intent.js';

export const ChatCardTypeSchema = z.enum([
  'principal_intent',
  'pfc_response',
  'pfc_plan',
  'pfc_decision',
  'run_status_update',
  'node_context_update',
  'node_context_promoted',
  'agent_advisory_update',
  'node_reasoning_log_entry',
  'control_request',
  'control_decision',
  'clarification_request',
  'evidence_link',
  'run_summary',
]);
export type ChatCardType = z.infer<typeof ChatCardTypeSchema>;

export const ChatThreadBindCommandSchema = z.object({
  command_id: z.string().uuid(),
  thread_id: z.string().uuid(),
  from_binding_kind: ChatThreadBindingKindSchema,
  to_binding_kind: z.enum(['task_run', 'node_scope', 'governance']),
  to_binding_ref: z.string().min(1),
  actor_id: z.string().min(1),
  reason: z.string().min(1),
  requested_at: z.string().datetime(),
});
export type ChatThreadBindCommand = z.infer<
  typeof ChatThreadBindCommandSchema
>;
