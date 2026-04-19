/**
 * Operator control command integrity types for Nous-OSS.
 *
 * Phase 2.5 — Control command envelope, confirmation proof, scope, action types.
 * Canonical source: operator-control-architecture-v1.md
 */
import { z } from 'zod';
import { ControlCommandIdSchema, ProjectIdSchema } from './ids.js';

// --- Actor and Scope Types ---

export const ControlActorTypeSchema = z.enum([
  'principal',
  'orchestration_agent',
  'worker_agent',
  'system_agent',
  'supervisor',
]);
export type ControlActorType = z.infer<typeof ControlActorTypeSchema>;

export const ControlScopeClassSchema = z.enum([
  'nous_scope',
  'project_run_scope',
  'execution_scope',
]);
export type ControlScopeClass = z.infer<typeof ControlScopeClassSchema>;

export const ControlScopeKindSchema = z.enum([
  'single_agent',
  'agent_set',
  'project_run',
]);
export type ControlScopeKind = z.infer<typeof ControlScopeKindSchema>;

export const ControlScopeSchema = z.object({
  class: ControlScopeClassSchema,
  kind: ControlScopeKindSchema,
  target_ids: z.array(z.string().uuid()).optional().default([]),
  project_id: ProjectIdSchema.optional(),
});
export type ControlScope = z.infer<typeof ControlScopeSchema>;

// --- Control Actions ---

export const ControlActionSchema = z.enum([
  'pause',
  'resume',
  'cancel',
  'hard_stop',
  'revert',
  'retry',
  'edit',
  'stop_response',
  'retry_step',
  'revert_to_previous_state',
  'edit_submitted_prompt',
]);
export type ControlAction = z.infer<typeof ControlActionSchema>;

// --- Confirmation Tiers ---

export const ConfirmationTierSchema = z.enum(['T0', 'T1', 'T2', 'T3']);
export type ConfirmationTier = z.infer<typeof ConfirmationTierSchema>;

export const ACTION_TIER_MAP: Record<ControlAction, ConfirmationTier> = {
  pause: 'T0',
  resume: 'T0',
  cancel: 'T1',
  hard_stop: 'T3',
  revert: 'T2',
  retry: 'T1',
  edit: 'T0',
  stop_response: 'T0',
  retry_step: 'T1',
  revert_to_previous_state: 'T2',
  edit_submitted_prompt: 'T0',
} satisfies Record<ControlAction, ConfirmationTier>;

// --- Control Command Envelope ---

export const ControlCommandEnvelopeSchema = z.object({
  control_command_id: ControlCommandIdSchema,
  actor_type: ControlActorTypeSchema,
  actor_id: z.string().uuid(),
  actor_session_id: z.string().uuid(),
  actor_seq: z.number().int().nonnegative(),
  nonce: z.string().uuid(),
  issued_at: z.string().datetime(),
  expires_at: z.string().datetime(),
  scope: ControlScopeSchema,
  payload_hash: z.string().regex(/^[a-f0-9]{64}$/),
  command_signature: z.string().min(1),
  action: ControlActionSchema,
  payload: z.record(z.unknown()).optional(),
});
export type ControlCommandEnvelope = z.infer<
  typeof ControlCommandEnvelopeSchema
>;

// --- Confirmation Proof ---

export const ConfirmationProofSchema = z.object({
  proof_id: z.string().uuid(),
  issued_at: z.string().datetime(),
  expires_at: z.string().datetime(),
  scope_hash: z.string().regex(/^[a-f0-9]{64}$/),
  action: ControlActionSchema,
  tier: ConfirmationTierSchema,
  signature: z.string().min(1),
});
export type ConfirmationProof = z.infer<typeof ConfirmationProofSchema>;

// --- ConfirmationProofRequest (for requestConfirmationProof) ---

export const ConfirmationProofRequestSchema = z.object({
  scope: ControlScopeSchema,
  action: ControlActionSchema,
  tier: ConfirmationTierSchema,
  reason: z.string().optional(),
});
export type ConfirmationProofRequest = z.infer<
  typeof ConfirmationProofRequestSchema
>;

// --- ScopeSnapshot (from resolveScope) ---

export const ScopeSnapshotSchema = z.object({
  scope: ControlScopeSchema,
  target_ids: z.array(z.string().uuid()),
  target_ids_hash: z.string().regex(/^[a-f0-9]{64}$/),
  target_count: z.number().int().nonnegative(),
  resolved_at: z.string().datetime(),
});
export type ScopeSnapshot = z.infer<typeof ScopeSnapshotSchema>;

// --- OpctlSubmitResult ---

export const OpctlSubmitResultStatusSchema = z.enum([
  'applied',
  'blocked',
  'rejected',
]);
export type OpctlSubmitResultStatus = z.infer<
  typeof OpctlSubmitResultStatusSchema
>;

export const OpctlSubmitResultSchema = z.object({
  status: OpctlSubmitResultStatusSchema,
  control_command_id: ControlCommandIdSchema,
  reason: z.string().optional(),
  reason_code: z.string().optional(),
  target_ids_hash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  witness_event_id: z.string().uuid().optional(),
  degraded_integrity: z.boolean().optional(),
});
export type OpctlSubmitResult = z.infer<typeof OpctlSubmitResultSchema>;

// --- Opctl Event Types (canonical strings for witness actionRef) ---

export const OpctlEventTypeSchema = z.enum([
  'opctl_command_received',
  'opctl_command_authenticated',
  'opctl_command_rejected',
  'opctl_scope_snapshot_resolved',
  'opctl_confirmation_required',
  'opctl_confirmation_satisfied',
  'opctl_confirmation_failed',
  'opctl_policy_evaluated',
  'opctl_applied',
  'opctl_blocked',
  'opctl_propagation_completed',
  'opctl_replay_detected',
  'opctl_conflict_resolved',
  'opctl_witness_write_failed',
  'opctl_emergency_hard_stop_applied',
  'opctl_start_lock_set',
  'opctl_start_lock_released',
  'opctl_agent_dispatch_attempt_blocked',
  'opctl_high_priority_alert_emitted',
]);
export type OpctlEventType = z.infer<typeof OpctlEventTypeSchema>;
