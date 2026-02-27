/**
 * Chat thread schemas for Nous-OSS.
 *
 * Phase 5.2 — Project-Chat-Cortex Control-Plane Runtime Binding.
 * Canonical source: project-chat-pfc-control-plane-canonical-architecture-v1.md
 */
import { z } from 'zod';
import {
  ChatThreadTypeSchema,
  ChatThreadBindingKindSchema,
  ChatThreadAuthorityModeSchema,
} from './chat-intent.js';

export const ChatThreadRiskStateSchema = z.enum([
  'normal',
  'elevated',
  'urgent',
]);
export type ChatThreadRiskState = z.infer<typeof ChatThreadRiskStateSchema>;

export const ChatThreadStatusSchema = z.enum([
  'open',
  'blocked',
  'waiting_principal',
  'waiting_pfc',
  'archived',
]);
export type ChatThreadStatus = z.infer<typeof ChatThreadStatusSchema>;

export const ProjectChatThreadSchema = z.object({
  thread_id: z.string().uuid(),
  project_id: z.string().uuid(),
  thread_type: ChatThreadTypeSchema,
  binding_kind: ChatThreadBindingKindSchema,
  binding_ref: z.string().nullable(),
  parent_thread_id: z.string().uuid().nullable(),
  promotion_source_ref: z.string().nullable(),
  authority_mode: ChatThreadAuthorityModeSchema,
  risk_state: ChatThreadRiskStateSchema,
  status: ChatThreadStatusSchema,
  created_by: z.string().min(1),
  created_at: z.string().datetime(),
});
export type ProjectChatThread = z.infer<typeof ProjectChatThreadSchema>;
