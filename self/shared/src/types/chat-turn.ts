/**
 * Chat turn envelope schemas for Nous-OSS.
 *
 * Phase 5.2 — Project-Chat-Cortex Control-Plane Runtime Binding.
 * Canonical source: project-chat-pfc-control-plane-canonical-architecture-v1.md
 */
import { z } from 'zod';

export const ChatActorTypeSchema = z.enum([
  'principal',
  'nous_cortex',
  'orchestration_agent',
  'worker_agent',
  'system',
]);
export type ChatActorType = z.infer<typeof ChatActorTypeSchema>;

export const ChatTurnEnvelopeSchema = z.object({
  turn_id: z.string().uuid(),
  actor_type: ChatActorTypeSchema,
  actor_id: z.string().min(1),
  actor_session_id: z.string().min(1),
  project_id: z.string().uuid().nullable(),
  run_id: z.string().uuid().nullable(),
  message_ref: z.string().min(1),
  received_at: z.string().datetime(),
  trace_parent: z.string().nullable(),
});
export type ChatTurnEnvelope = z.infer<typeof ChatTurnEnvelopeSchema>;
