import { z } from 'zod';
import { EscalationIdSchema, ProjectIdSchema } from './ids.js';
import { RecoveryFailureClassSchema } from './recovery-failure-class.js';

export const CommunicationChannelSchema = z.enum(['telegram', 'matrix', 'slack']);
export type CommunicationChannel = z.infer<typeof CommunicationChannelSchema>;

export const CommunicationBindingStateSchema = z.enum([
  'unbound',
  'active',
  'revoked',
]);
export type CommunicationBindingState = z.infer<
  typeof CommunicationBindingStateSchema
>;

export const CommunicationRouteKindSchema = z.enum([
  'approval_intake',
  'project_message',
  'escalation_acknowledgement',
  'advisory_delivery',
  'system_notice',
]);
export type CommunicationRouteKind = z.infer<
  typeof CommunicationRouteKindSchema
>;

export const CommunicationRejectReasonSchema = z.enum([
  'unauthenticated_connector',
  'unknown_account_binding',
  'unauthorized_channel',
  'identity_unbound',
  'mention_required',
  'conversation_not_allowed',
  'thread_not_allowed',
  'policy_blocked',
  'route_conflict',
  'duplicate_egress',
  'permanent_delivery_failure',
  'unknown_external_effect',
]);
export type CommunicationRejectReason = z.infer<
  typeof CommunicationRejectReasonSchema
>;

export const CommunicationMentionStateSchema = z.enum([
  'none',
  'direct',
  'explicit',
]);
export type CommunicationMentionState = z.infer<
  typeof CommunicationMentionStateSchema
>;

export const CommunicationMessageTypeSchema = z.enum([
  'dm',
  'group',
  'thread',
  'system',
]);
export type CommunicationMessageType = z.infer<
  typeof CommunicationMessageTypeSchema
>;

export const CommunicationMessageClassSchema = z.enum([
  'response',
  'alert',
  'escalation',
  'system_notice',
]);
export type CommunicationMessageClass = z.infer<
  typeof CommunicationMessageClassSchema
>;

export const CommunicationApprovalIntakeStatusSchema = z.enum([
  'pending',
  'resolved',
  'dismissed',
]);
export type CommunicationApprovalIntakeStatus = z.infer<
  typeof CommunicationApprovalIntakeStatusSchema
>;

export const ChannelIngressEnvelopeSchema = z.object({
  ingress_id: z.string().uuid(),
  channel: CommunicationChannelSchema,
  channel_id: z.string().min(1),
  workspace_id: z.string().min(1).nullable(),
  account_id: z.string().min(1),
  conversation_id: z.string().min(1),
  thread_id: z.string().min(1).nullable(),
  message_id: z.string().min(1),
  sender_channel_identity: z.string().min(1),
  bound_principal_id: z.string().min(1).nullable(),
  mention_state: CommunicationMentionStateSchema,
  message_type: CommunicationMessageTypeSchema,
  payload_ref: z.string().min(1),
  idempotency_key: z.string().min(1),
  occurred_at: z.string().datetime(),
  received_at: z.string().datetime(),
  auth_context_ref: z.string().min(1).nullable(),
  trace_parent: z.string().nullable(),
});
export type ChannelIngressEnvelope = z.infer<typeof ChannelIngressEnvelopeSchema>;

export const ChannelEgressEnvelopeSchema = z.object({
  egress_id: z.string().uuid(),
  channel: CommunicationChannelSchema,
  channel_id: z.string().min(1),
  workspace_id: z.string().min(1).nullable(),
  account_id: z.string().min(1),
  conversation_id: z.string().min(1),
  thread_id: z.string().min(1).nullable(),
  recipient_binding_ref: z.string().min(1),
  message_class: CommunicationMessageClassSchema,
  payload_ref: z.string().min(1),
  delivery_policy_ref: z.string().min(1),
  retry_policy_ref: z.string().min(1),
  requested_at: z.string().datetime(),
  trace_parent: z.string().nullable(),
});
export type ChannelEgressEnvelope = z.infer<typeof ChannelEgressEnvelopeSchema>;

export const CommunicationIdentityBindingUpsertInputSchema = z.object({
  channel: CommunicationChannelSchema,
  account_id: z.string().min(1),
  channel_identity: z.string().min(1),
  principal_id: z.string().min(1).nullable(),
  requested_state: z.enum(['active', 'revoked']),
  approved_by: z.string().min(1),
  approval_reason: z.string().min(1),
  failover_group_ref: z.string().min(1).optional(),
  evidence_refs: z.array(z.string().min(1)).min(1),
});
export type CommunicationIdentityBindingUpsertInput = z.infer<
  typeof CommunicationIdentityBindingUpsertInputSchema
>;

export const CommunicationIdentityBindingRecordSchema = z.object({
  binding_id: z.string().uuid(),
  channel: CommunicationChannelSchema,
  account_id: z.string().min(1),
  channel_identity: z.string().min(1),
  principal_id: z.string().min(1).nullable(),
  state: CommunicationBindingStateSchema,
  approved_by: z.string().min(1).optional(),
  approved_at: z.string().datetime().optional(),
  revoked_at: z.string().datetime().optional(),
  failover_group_ref: z.string().min(1).optional(),
  evidence_refs: z.array(z.string().min(1)).default([]),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type CommunicationIdentityBindingRecord = z.infer<
  typeof CommunicationIdentityBindingRecordSchema
>;

export const CommunicationApprovalIntakeRecordSchema = z.object({
  intake_id: z.string().uuid(),
  channel: CommunicationChannelSchema,
  account_id: z.string().min(1),
  conversation_id: z.string().min(1),
  channel_identity: z.string().min(1),
  latest_ingress_id: z.string().uuid(),
  status: CommunicationApprovalIntakeStatusSchema,
  evidence_refs: z.array(z.string().min(1)).default([]),
  first_seen_at: z.string().datetime(),
  last_seen_at: z.string().datetime(),
});
export type CommunicationApprovalIntakeRecord = z.infer<
  typeof CommunicationApprovalIntakeRecordSchema
>;

export const CommunicationPolicyDecisionSchema = z.object({
  decision_id: z.string().uuid(),
  ingress_id: z.string().uuid().optional(),
  egress_id: z.string().uuid().optional(),
  connector_authenticated: z.boolean(),
  account_authorized: z.boolean(),
  binding_state: CommunicationBindingStateSchema,
  mention_policy_allowed: z.boolean(),
  conversation_policy_allowed: z.boolean(),
  thread_policy_allowed: z.boolean(),
  reason_codes: z.array(CommunicationRejectReasonSchema).default([]),
  evidence_refs: z.array(z.string().min(1)).default([]),
  evaluated_at: z.string().datetime(),
});
export type CommunicationPolicyDecision = z.infer<
  typeof CommunicationPolicyDecisionSchema
>;

export const CommunicationRouteDecisionSchema = z.object({
  route_id: z.string().uuid(),
  route_kind: CommunicationRouteKindSchema,
  route_key: z.string().min(1),
  policy_decision_id: z.string().uuid(),
  project_id: ProjectIdSchema.optional(),
  escalation_id: EscalationIdSchema.optional(),
  nudge_candidate_id: z.string().min(1).optional(),
  precedence_rank: z.number().int().min(0),
  rule_id: z.string().min(1),
  evidence_refs: z.array(z.string().min(1)).default([]),
  created_at: z.string().datetime(),
});
export type CommunicationRouteDecision = z.infer<
  typeof CommunicationRouteDecisionSchema
>;

export const CommunicationDeliveryAttemptOutcomeSchema = z.enum([
  'deduplicated',
  'delivered',
  'delivery_blocked',
  'delivery_failed',
  'review_required',
]);
export type CommunicationDeliveryAttemptOutcome = z.infer<
  typeof CommunicationDeliveryAttemptOutcomeSchema
>;

export const CommunicationDeliveryAttemptSchema = z.object({
  delivery_attempt_id: z.string().uuid(),
  route_id: z.string().uuid(),
  egress_id: z.string().uuid(),
  outcome: CommunicationDeliveryAttemptOutcomeSchema,
  failure_class: RecoveryFailureClassSchema.optional(),
  retry_budget_remaining: z.number().int().min(0),
  provider_message_ref: z.string().min(1).optional(),
  failover_target_binding_ref: z.string().min(1).optional(),
  reason_codes: z.array(CommunicationRejectReasonSchema).default([]),
  evidence_refs: z.array(z.string().min(1)).default([]),
  occurred_at: z.string().datetime(),
});
export type CommunicationDeliveryAttempt = z.infer<
  typeof CommunicationDeliveryAttemptSchema
>;

export const CommunicationEscalationAcknowledgementInputSchema = z.object({
  escalation_id: EscalationIdSchema,
  binding_id: z.string().uuid(),
  acknowledged_by_principal_id: z.string().min(1),
  channel: CommunicationChannelSchema,
  account_id: z.string().min(1),
  conversation_id: z.string().min(1),
  message_id: z.string().min(1),
  acknowledgement_token: z.string().min(1),
  acknowledged_at: z.string().datetime(),
  evidence_refs: z.array(z.string().min(1)).min(1),
});
export type CommunicationEscalationAcknowledgementInput = z.infer<
  typeof CommunicationEscalationAcknowledgementInputSchema
>;

export const CommunicationIngressOutcomeSchema = z.discriminatedUnion('outcome', [
  z.object({
    outcome: z.literal('approval_intake_recorded'),
    intake: CommunicationApprovalIntakeRecordSchema,
    policy: CommunicationPolicyDecisionSchema,
    route: CommunicationRouteDecisionSchema,
  }),
  z.object({
    outcome: z.literal('accepted_routed'),
    policy: CommunicationPolicyDecisionSchema,
    route: CommunicationRouteDecisionSchema,
  }),
  z.object({
    outcome: z.literal('rejected'),
    reason: CommunicationRejectReasonSchema,
    policy: CommunicationPolicyDecisionSchema,
    evidence_refs: z.array(z.string().min(1)).min(1),
  }),
]);
export type CommunicationIngressOutcome = z.infer<
  typeof CommunicationIngressOutcomeSchema
>;

export const CommunicationEgressOutcomeSchema = z.discriminatedUnion('outcome', [
  z.object({
    outcome: z.literal('deduplicated'),
    attempt: CommunicationDeliveryAttemptSchema,
  }),
  z.object({
    outcome: z.literal('delivered'),
    attempt: CommunicationDeliveryAttemptSchema,
  }),
  z.object({
    outcome: z.literal('blocked'),
    attempt: CommunicationDeliveryAttemptSchema,
  }),
  z.object({
    outcome: z.literal('failed_review_required'),
    attempt: CommunicationDeliveryAttemptSchema,
  }),
]);
export type CommunicationEgressOutcome = z.infer<
  typeof CommunicationEgressOutcomeSchema
>;
