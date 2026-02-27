/**
 * Chat intent and thread type schemas for Nous-OSS.
 *
 * Phase 5.2 — Project-Chat-Cortex Control-Plane Runtime Binding.
 * Canonical source: project-chat-pfc-control-plane-canonical-architecture-v1.md
 */
import { z } from 'zod';

export const ChatIntentClassSchema = z.enum([
  'conversational',
  'execution_request',
  'control_intent',
  'project_admin',
  'ambiguous',
]);
export type ChatIntentClass = z.infer<typeof ChatIntentClassSchema>;

export const ChatThreadTypeSchema = z.enum([
  'project_root',
  'run_thread',
  'node_thread',
  'governance_thread',
  'scratch_thread',
]);
export type ChatThreadType = z.infer<typeof ChatThreadTypeSchema>;

export const ChatThreadBindingKindSchema = z.enum([
  'project_root',
  'task_run',
  'node_scope',
  'governance',
  'scratch',
]);
export type ChatThreadBindingKind = z.infer<typeof ChatThreadBindingKindSchema>;

export const ChatThreadAuthorityModeSchema = z.enum([
  'authoritative',
  'advisory_only',
  'non_executable',
]);
export type ChatThreadAuthorityMode = z.infer<
  typeof ChatThreadAuthorityModeSchema
>;

export const ChatTurnDecisionSchema = z.object({
  turn_id: z.string().uuid(),
  intent_class: ChatIntentClassSchema,
  decision: z.enum([
    'respond',
    'dispatch',
    'control_command',
    'clarify',
    'block',
  ]),
  decision_reason: z.string().min(1),
  policy_ref: z.string().nullable(),
  command_ref: z.string().nullable(),
  lease_ref: z.string().nullable(),
  evidence_ref: z.string().min(1),
});
export type ChatTurnDecision = z.infer<typeof ChatTurnDecisionSchema>;
