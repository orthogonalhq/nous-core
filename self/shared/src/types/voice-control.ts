import { z } from 'zod';
import { ConfidenceGovernanceEvaluationResultSchema } from './confidence-governance.js';
import {
  EndpointCapabilityClassSchema,
  EndpointTransportEnvelopeSchema,
} from './endpoint-trust.js';
import { EscalationIdSchema, ProjectIdSchema } from './ids.js';
import {
  ConfirmationProofSchema,
  ConfirmationTierSchema,
  ControlCommandEnvelopeSchema,
} from './opctl.js';

export const VoiceInteractionChannelSchema = z.enum([
  'web',
  'bridge',
  'mobile_shell',
]);
export type VoiceInteractionChannel = z.infer<
  typeof VoiceInteractionChannelSchema
>;

export const VoiceTurnRoleSchema = z.enum(['principal', 'assistant']);
export type VoiceTurnRole = z.infer<typeof VoiceTurnRoleSchema>;

export const VoiceTurnStateSchema = z.enum([
  'listening',
  'evaluating',
  'awaiting_text_confirmation',
  'continuation_required',
  'completed',
  'blocked',
]);
export type VoiceTurnState = z.infer<typeof VoiceTurnStateSchema>;

export const VoiceTurnEndSignalSchema = z.enum([
  'semantic_completion',
  'silence_window_elapsed',
  'explicit_handoff_keyword',
]);
export type VoiceTurnEndSignal = z.infer<typeof VoiceTurnEndSignalSchema>;

export const VoiceAssistantOutputStateSchema = z.enum([
  'idle',
  'speaking',
  'interrupted_by_user',
  'awaiting_continuation',
  'completed',
]);
export type VoiceAssistantOutputState = z.infer<
  typeof VoiceAssistantOutputStateSchema
>;

export const VoiceDegradedModeReasonSchema = z.enum([
  'low_asr_confidence',
  'low_intent_confidence',
  'handoff_instability',
  'transport_degraded',
  'barge_in_recovery_required',
]);
export type VoiceDegradedModeReason = z.infer<
  typeof VoiceDegradedModeReasonSchema
>;

export const VoiceDecisionOutcomeSchema = z.enum([
  'continue_listening',
  'clarify',
  'text_confirmation_required',
  'dual_channel_confirmation_required',
  'blocked',
  'ready_for_canonical_execution',
]);
export type VoiceDecisionOutcome = z.infer<
  typeof VoiceDecisionOutcomeSchema
>;

export const VoiceIntentClassSchema = z.enum([
  'escalation_acknowledgement',
  'project_control',
  'assistant_continuation',
  'clarification_response',
  'non_control_message',
]);
export type VoiceIntentClass = z.infer<typeof VoiceIntentClassSchema>;

export const VoiceIntentActionCategorySchema = z.enum([
  'opctl-command',
  'communication-ack',
  'trace-persist',
  'none',
]);
export type VoiceIntentActionCategory = z.infer<
  typeof VoiceIntentActionCategorySchema
>;

export const VoiceIntentRiskLevelSchema = z.enum([
  'low',
  'medium',
  'high',
  'critical',
]);
export type VoiceIntentRiskLevel = z.infer<typeof VoiceIntentRiskLevelSchema>;

export const VoiceContinuationResolutionSchema = z.enum([
  'resume_assistant',
  'cancel_output',
  'switch_to_text',
]);
export type VoiceContinuationResolution = z.infer<
  typeof VoiceContinuationResolutionSchema
>;

export const VoiceTurnStartInputSchema = z.object({
  turn_id: z.string().uuid().optional(),
  session_id: z.string().uuid(),
  project_id: ProjectIdSchema,
  principal_id: z.string().min(1),
  route_ref: z.string().min(1).optional(),
  escalation_id: EscalationIdSchema.optional(),
  endpoint_id: z.string().uuid().optional(),
  channel: VoiceInteractionChannelSchema,
  started_at: z.string().datetime().optional(),
  evidence_refs: z.array(z.string().min(1)).default([]),
});
export type VoiceTurnStartInput = z.infer<typeof VoiceTurnStartInputSchema>;

export const VoiceTurnSignalBundleSchema = z.object({
  transcript_hash: z.string().regex(/^[a-f0-9]{64}$/),
  handoff_keywords_detected: z.array(z.string().min(1)).default([]),
  semantic_completion_score: z.number().min(0).max(1),
  silence_window_ms: z.number().int().min(0),
  silence_threshold_ms: z.number().int().positive(),
  explicit_handoff_detected: z.boolean(),
  asr_confidence: z.number().min(0).max(1),
  intent_confidence: z.number().min(0).max(1),
  handoff_confidence: z.number().min(0).max(1),
  observed_at: z.string().datetime(),
});
export type VoiceTurnSignalBundle = z.infer<typeof VoiceTurnSignalBundleSchema>;

export const VoiceIntentCandidateSchema = z.object({
  intent_id: z.string().uuid(),
  turn_id: z.string().uuid(),
  project_id: ProjectIdSchema,
  intent_class: VoiceIntentClassSchema,
  action_category: VoiceIntentActionCategorySchema,
  risk_level: VoiceIntentRiskLevelSchema,
  route_ref: z.string().min(1).optional(),
  escalation_id: EscalationIdSchema.optional(),
  requested_action_ref: z.string().min(1).optional(),
  evidence_refs: z.array(z.string().min(1)).default([]),
});
export type VoiceIntentCandidate = z.infer<typeof VoiceIntentCandidateSchema>;

export const VoiceEndpointAuthorizationContextSchema = z.object({
  peripheral_id: z.string().uuid(),
  endpoint_id: z.string().uuid(),
  capability_key: z.string().min(1),
  capability_class: EndpointCapabilityClassSchema.default('action'),
  policy_ref: z.string().min(1),
  session_id: z.string().uuid().optional(),
  transport_envelope: EndpointTransportEnvelopeSchema.optional(),
});
export type VoiceEndpointAuthorizationContext = z.infer<
  typeof VoiceEndpointAuthorizationContextSchema
>;

export const VoiceTurnEvaluationInputSchema = z.object({
  turn_id: z.string().uuid(),
  session_id: z.string().uuid(),
  project_id: ProjectIdSchema,
  principal_id: z.string().min(1),
  signals: VoiceTurnSignalBundleSchema,
  intents: z.array(VoiceIntentCandidateSchema).default([]),
  active_principal_session_ref: z.string().min(1).optional(),
  confirmation_proof: ConfirmationProofSchema.optional(),
  control_command_envelope: ControlCommandEnvelopeSchema.optional(),
  endpoint_authorization: VoiceEndpointAuthorizationContextSchema.optional(),
  requested_at: z.string().datetime().optional(),
  evidence_refs: z.array(z.string().min(1)).default([]),
});
export type VoiceTurnEvaluationInput = z.infer<
  typeof VoiceTurnEvaluationInputSchema
>;

export const VoiceTurnStateRecordSchema = z.object({
  turn_id: z.string().uuid(),
  session_id: z.string().uuid(),
  project_id: ProjectIdSchema,
  principal_id: z.string().min(1),
  state: VoiceTurnStateSchema,
  route_ref: z.string().min(1).optional(),
  escalation_id: EscalationIdSchema.optional(),
  started_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  evidence_refs: z.array(z.string().min(1)).default([]),
});
export type VoiceTurnStateRecord = z.infer<typeof VoiceTurnStateRecordSchema>;

export const VoiceConfirmationRequirementSchema = z.object({
  required: z.boolean(),
  confirmation_tier: ConfirmationTierSchema.optional(),
  dual_channel_required: z.boolean(),
  active_principal_session_ref: z.string().min(1).optional(),
  text_surface_targets: z
    .array(z.enum(['chat', 'projects', 'mao']))
    .default([]),
  reason_code: z.string().min(1).optional(),
});
export type VoiceConfirmationRequirement = z.infer<
  typeof VoiceConfirmationRequirementSchema
>;

export const VoiceTurnDecisionRecordSchema = z.object({
  decision_id: z.string().uuid(),
  turn_id: z.string().uuid(),
  session_id: z.string().uuid(),
  project_id: ProjectIdSchema,
  outcome: VoiceDecisionOutcomeSchema,
  intent: VoiceIntentCandidateSchema.nullable(),
  signals: VoiceTurnSignalBundleSchema,
  confidence_decision: ConfidenceGovernanceEvaluationResultSchema.optional(),
  confirmation: VoiceConfirmationRequirementSchema,
  degraded_mode_active: z.boolean(),
  degraded_reason: VoiceDegradedModeReasonSchema.optional(),
  route_ref: z.string().min(1).optional(),
  escalation_id: EscalationIdSchema.optional(),
  decision_ref: z.string().min(1),
  evidence_refs: z.array(z.string().min(1)).min(1),
  decided_at: z.string().datetime(),
});
export type VoiceTurnDecisionRecord = z.infer<
  typeof VoiceTurnDecisionRecordSchema
>;

export const VoiceAssistantOutputInputSchema = z.object({
  session_id: z.string().uuid(),
  project_id: ProjectIdSchema,
  output_id: z.string().uuid().optional(),
  output_hash: z.string().regex(/^[a-f0-9]{64}$/),
  state: VoiceAssistantOutputStateSchema,
  started_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),
  evidence_refs: z.array(z.string().min(1)).default([]),
});
export type VoiceAssistantOutputInput = z.infer<
  typeof VoiceAssistantOutputInputSchema
>;

export const VoiceAssistantOutputStateRecordSchema = z.object({
  output_id: z.string().uuid(),
  session_id: z.string().uuid(),
  project_id: ProjectIdSchema,
  state: VoiceAssistantOutputStateSchema,
  output_hash: z.string().regex(/^[a-f0-9]{64}$/),
  started_at: z.string().datetime(),
  completed_at: z.string().datetime().optional(),
  updated_at: z.string().datetime(),
  evidence_refs: z.array(z.string().min(1)).default([]),
});
export type VoiceAssistantOutputStateRecord = z.infer<
  typeof VoiceAssistantOutputStateRecordSchema
>;

export const VoiceBargeInInputSchema = z.object({
  barge_in_id: z.string().uuid().optional(),
  session_id: z.string().uuid(),
  project_id: ProjectIdSchema,
  active_output_id: z.string().uuid(),
  detected_at: z.string().datetime(),
  stop_completed_at: z.string().datetime(),
  evidence_refs: z.array(z.string().min(1)).default([]),
});
export type VoiceBargeInInput = z.infer<typeof VoiceBargeInInputSchema>;

export const VoiceBargeInRecordSchema = z.object({
  barge_in_id: z.string().uuid(),
  session_id: z.string().uuid(),
  project_id: ProjectIdSchema,
  active_output_id: z.string().uuid(),
  latency_ms: z.number().int().min(0),
  continuation_required: z.boolean(),
  evidence_refs: z.array(z.string().min(1)).min(1),
  detected_at: z.string().datetime(),
  stop_completed_at: z.string().datetime(),
});
export type VoiceBargeInRecord = z.infer<typeof VoiceBargeInRecordSchema>;

export const VoiceContinuationInputSchema = z.object({
  continuation_id: z.string().uuid().optional(),
  session_id: z.string().uuid(),
  project_id: ProjectIdSchema,
  output_id: z.string().uuid().optional(),
  principal_id: z.string().min(1).optional(),
  resolution: VoiceContinuationResolutionSchema,
  requested_at: z.string().datetime().optional(),
  evidence_refs: z.array(z.string().min(1)).default([]),
});
export type VoiceContinuationInput = z.infer<
  typeof VoiceContinuationInputSchema
>;

export const VoiceContinuationRecordSchema = z.object({
  continuation_id: z.string().uuid(),
  session_id: z.string().uuid(),
  project_id: ProjectIdSchema,
  output_id: z.string().uuid().optional(),
  resolution: VoiceContinuationResolutionSchema,
  continuation_required: z.boolean(),
  assistant_output_state: VoiceAssistantOutputStateSchema,
  turn_state: VoiceTurnStateSchema,
  evidence_refs: z.array(z.string().min(1)).min(1),
  resolved_at: z.string().datetime(),
});
export type VoiceContinuationRecord = z.infer<
  typeof VoiceContinuationRecordSchema
>;

export const VoiceDegradedModeStateSchema = z.object({
  session_id: z.string().uuid(),
  project_id: ProjectIdSchema,
  active: z.boolean(),
  reason: VoiceDegradedModeReasonSchema.optional(),
  entered_at: z.string().datetime().optional(),
  recovery_window_started_at: z.string().datetime().optional(),
  last_recovered_at: z.string().datetime().optional(),
  evidence_refs: z.array(z.string().min(1)).default([]),
});
export type VoiceDegradedModeState = z.infer<
  typeof VoiceDegradedModeStateSchema
>;

export const VoiceSessionProjectionInputSchema = z.object({
  session_id: z.string().uuid().optional(),
  project_id: ProjectIdSchema,
  principal_id: z.string().min(1).optional(),
});
export type VoiceSessionProjectionInput = z.infer<
  typeof VoiceSessionProjectionInputSchema
>;

export const VoiceSessionProjectionSchema = z.object({
  session_id: z.string().uuid(),
  project_id: ProjectIdSchema,
  principal_id: z.string().min(1),
  current_turn_state: VoiceTurnStateSchema,
  assistant_output_state: VoiceAssistantOutputStateSchema,
  degraded_mode: VoiceDegradedModeStateSchema,
  pending_confirmation: VoiceConfirmationRequirementSchema,
  continuation_required: z.boolean(),
  last_route_ref: z.string().min(1).optional(),
  last_escalation_id: EscalationIdSchema.optional(),
  evidence_refs: z.array(z.string().min(1)).default([]),
  updated_at: z.string().datetime(),
});
export type VoiceSessionProjection = z.infer<
  typeof VoiceSessionProjectionSchema
>;

export const VoiceControlEventTypeSchema = z.enum([
  'voice_turn_started',
  'voice_turn_ended',
  'voice_handoff_detected',
  'voice_handoff_rejected',
  'voice_intent_parsed',
  'voice_intent_low_confidence',
  'voice_policy_evaluated',
  'voice_confirmation_required',
  'voice_confirmation_satisfied',
  'voice_confirmation_failed',
  'voice_action_authorized',
  'voice_action_blocked',
  'voice_barge_in_detected',
  'voice_assistant_output_stopped',
  'voice_degraded_mode_entered',
  'voice_degraded_mode_exited',
]);
export type VoiceControlEventType = z.infer<
  typeof VoiceControlEventTypeSchema
>;
