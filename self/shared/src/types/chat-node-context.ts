/**
 * Chat node context and reasoning log schemas for Nous-OSS.
 *
 * Phase 5.2 — Project-Chat-Cortex Control-Plane Runtime Binding.
 * Canonical source: project-chat-pfc-control-plane-canonical-architecture-v1.md
 */
import { z } from 'zod';
import { ChatThreadRiskStateSchema } from './chat-thread.js';

export const NodeContextStateSchema = z.enum([
  'queued',
  'running',
  'blocked',
  'failed',
  'completed',
]);
export type NodeContextState = z.infer<typeof NodeContextStateSchema>;

export const NodeContextCardSchema = z.object({
  card_id: z.string().uuid(),
  project_id: z.string().uuid(),
  run_id: z.string().uuid(),
  node_scope_ref: z.string().min(1),
  parent_thread_id: z.string().uuid(),
  state: NodeContextStateSchema,
  risk_state: ChatThreadRiskStateSchema,
  summary: z.string(),
  evidence_ref: z.string().min(1),
  emitted_at: z.string().datetime(),
});
export type NodeContextCard = z.infer<typeof NodeContextCardSchema>;

export const NodeReasoningLogClassSchema = z.enum([
  'intent_summary',
  'action_step',
  'evidence_read',
  'tool_call',
  'result_summary',
  'blocker',
  'next_action',
]);
export type NodeReasoningLogClass = z.infer<
  typeof NodeReasoningLogClassSchema
>;

export const NodeReasoningLogEntrySchema = z.object({
  entry_id: z.string().uuid(),
  project_id: z.string().uuid(),
  run_id: z.string().uuid(),
  node_scope_ref: z.string().min(1),
  class: NodeReasoningLogClassSchema,
  summary: z.string(),
  artifact_refs: z.array(z.string()),
  evidence_ref: z.string().min(1),
  confidence: z.enum(['low', 'medium', 'high']),
  risk_state: ChatThreadRiskStateSchema,
  redaction_class: z.enum(['public_operator', 'restricted']),
  emitted_at: z.string().datetime(),
});
export type NodeReasoningLogEntry = z.infer<
  typeof NodeReasoningLogEntrySchema
>;
