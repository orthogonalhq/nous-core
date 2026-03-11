import { z } from 'zod';
import {
  ConfidenceGovernanceEvaluationInputSchema,
  ConfidenceGovernanceEvaluationResultSchema,
} from './confidence-governance.js';
import { TraceEvidenceReferenceSchema } from './evidence.js';
import { ProjectDiscoveryPolicySummarySchema } from './knowledge-index.js';
import { ProjectIdSchema, TraceIdSchema } from './ids.js';
import {
  RegistryInstallEligibilitySnapshotSchema,
  RegistryCompatibilityStateSchema,
  RegistryTrustTierSchema,
} from './registry.js';
import { CrossProjectRecommendationExplainabilitySchema } from './explainability.js';

export const NudgeReasonCodeSchema = z.enum([
  'NDG-SIGNAL-WORKFLOW-FRICTION',
  'NDG-SIGNAL-MISSING-CAPABILITY',
  'NDG-SIGNAL-MANUAL-WORKAROUND',
  'NDG-SIGNAL-BENCHMARK-GAP',
  'NDG-CANDIDATE-ELIGIBLE',
  'NDG-CANDIDATE-BLOCKED-REGISTRY',
  'NDG-CANDIDATE-BLOCKED-COMPATIBILITY',
  'NDG-CANDIDATE-BLOCKED-POLICY-DENIAL',
  'NDG-RANK-POLICY-VERSION-APPLIED',
  'NDG-RANK-BLOCKED-MISSING-POLICY',
  'NDG-SUPPRESSION-DISMISS-ONCE',
  'NDG-SUPPRESSION-SNOOZE-ACTIVE',
  'NDG-SUPPRESSION-MUTED-CATEGORY',
  'NDG-SUPPRESSION-MUTED-PROJECT',
  'NDG-SUPPRESSION-MUTED-GLOBAL',
  'NDG-DELIVERY-ALLOWED',
  'NDG-DELIVERY-BLOCKED-SUPPRESSION',
  'NDG-DELIVERY-BLOCKED-CONFIDENCE',
  'NDG-DELIVERY-BLOCKED-AUTHORITY',
  'NDG-ACCEPTANCE-ROUTED-RUNTIME-AUTH',
  'NDG-ACCEPTANCE-RECORDED-ADVISORY',
]);
export type NudgeReasonCode = z.infer<typeof NudgeReasonCodeSchema>;

export const NudgeDeliverySurfaceSchema = z.enum([
  'discovery_card',
  'cli_suggestion',
  'communication_gateway',
]);
export type NudgeDeliverySurface = z.infer<typeof NudgeDeliverySurfaceSchema>;

export const NudgeSuppressionScopeSchema = z.enum([
  'candidate',
  'category',
  'project',
  'global',
]);
export type NudgeSuppressionScope = z.infer<typeof NudgeSuppressionScopeSchema>;

export const NudgeSuppressionActionSchema = z.enum([
  'dismiss_once',
  'snooze',
  'mute_category',
  'mute_project',
  'mute_global',
]);
export type NudgeSuppressionAction = z.infer<typeof NudgeSuppressionActionSchema>;

export const NudgeSignalSchema = z.object({
  signal_id: z.string().min(1),
  signal_type: z.enum([
    'workflow_friction',
    'missing_capability',
    'manual_workaround',
    'benchmark_gap',
  ]),
  target_scope: z.enum(['global', 'project']),
  source_refs: z.array(z.string().min(1)).default([]),
  created_at: z.string().datetime(),
});
export type NudgeSignal = z.infer<typeof NudgeSignalSchema>;

export const NudgeSignalRecordSchema = NudgeSignalSchema.extend({
  requesting_project_id: ProjectIdSchema.optional(),
  trace_id: TraceIdSchema.optional(),
  evidence_refs: z.array(TraceEvidenceReferenceSchema).min(1),
});
export type NudgeSignalRecord = z.infer<typeof NudgeSignalRecordSchema>;

export const NudgeSignalRecordInputSchema = z.object({
  signal_type: NudgeSignalSchema.shape.signal_type,
  target_scope: NudgeSignalSchema.shape.target_scope,
  source_refs: z.array(z.string().min(1)).min(1),
  requesting_project_id: ProjectIdSchema.optional(),
  trace_id: TraceIdSchema.optional(),
  evidence_refs: z.array(TraceEvidenceReferenceSchema).min(1),
});
export type NudgeSignalRecordInput = z.infer<typeof NudgeSignalRecordInputSchema>;

export const NudgeCandidateSchema = z.object({
  candidate_id: z.string().min(1),
  source_type: z.enum([
    'marketplace_package',
    'workflow_template',
    'runtime_tip',
    'first_party_guidance',
  ]),
  source_ref: z.string().min(1),
  origin_trust_tier: RegistryTrustTierSchema,
  compatibility_state: RegistryCompatibilityStateSchema,
  target_scope: z.enum(['global', 'project']),
  reason_codes: z.array(z.string().min(1)).default([]),
  created_at: z.string().datetime(),
});
export type NudgeCandidate = z.infer<typeof NudgeCandidateSchema>;

export const NudgeCandidateEnvelopeSchema = z.object({
  candidate: NudgeCandidateSchema,
  registry_eligibility: RegistryInstallEligibilitySnapshotSchema.optional(),
  discovery_explainability: z
    .array(CrossProjectRecommendationExplainabilitySchema)
    .default([]),
  reason_codes: z.array(NudgeReasonCodeSchema).default([]),
  evidence_refs: z.array(TraceEvidenceReferenceSchema).min(1),
  blocked: z.boolean(),
});
export type NudgeCandidateEnvelope = z.infer<typeof NudgeCandidateEnvelopeSchema>;

export const NudgeCandidateSeedSchema = z.object({
  candidate: NudgeCandidateSchema,
  registry_eligibility: RegistryInstallEligibilitySnapshotSchema.optional(),
  discovery_explainability: z
    .array(CrossProjectRecommendationExplainabilitySchema)
    .default([]),
  discovery_policy: ProjectDiscoveryPolicySummarySchema.optional(),
  evidence_refs: z.array(TraceEvidenceReferenceSchema).min(1),
  blocked: z.boolean().optional(),
});
export type NudgeCandidateSeed = z.infer<typeof NudgeCandidateSeedSchema>;

export const NudgeCandidateGenerationInputSchema = z.object({
  signal: NudgeSignalRecordSchema,
  seeds: z.array(NudgeCandidateSeedSchema).default([]),
});
export type NudgeCandidateGenerationInput = z.infer<
  typeof NudgeCandidateGenerationInputSchema
>;

export const NudgeCandidateGenerationResultSchema = z.object({
  signal_id: z.string().min(1),
  candidates: z.array(NudgeCandidateEnvelopeSchema).default([]),
  generated_at: z.string().datetime(),
});
export type NudgeCandidateGenerationResult = z.infer<
  typeof NudgeCandidateGenerationResultSchema
>;

export const NudgeRankingPolicySchema = z.object({
  policy_id: z.string().uuid(),
  version: z.string().min(1),
  scoring_weights: z.object({
    relevance: z.number(),
    expected_outcome_gain: z.number(),
    trust_confidence: z.number(),
    compatibility_confidence: z.number(),
    novelty: z.number(),
    fatigue_penalty: z.number(),
    risk_penalty: z.number(),
  }),
  approval_evidence_ref: z.string().min(1),
  witness_ref: z.string().min(1),
  effective_at: z.string().datetime(),
  retired_at: z.string().datetime().optional(),
});
export type NudgeRankingPolicy = z.infer<typeof NudgeRankingPolicySchema>;

export const NudgeRankComponentSchema = z.object({
  relevance: z.number(),
  expected_outcome_gain: z.number(),
  trust_confidence: z.number(),
  compatibility_confidence: z.number(),
  novelty: z.number(),
  fatigue_penalty: z.number(),
  risk_penalty: z.number(),
  final_score: z.number(),
});
export type NudgeRankComponent = z.infer<typeof NudgeRankComponentSchema>;

export const NudgeDecisionSchema = z.object({
  decision_id: z.string().min(1),
  candidate_id: z.string().min(1),
  rank_score: z.number(),
  rank_components_ref: z.string().min(1),
  suppression_state: z.enum(['eligible', 'suppressed']),
  delivery_surface_set: z.array(NudgeDeliverySurfaceSchema).default([]),
  expires_at: z.string().datetime(),
});
export type NudgeDecision = z.infer<typeof NudgeDecisionSchema>;

export const NudgeRankingFeatureInputSchema = z.object({
  relevance: z.number(),
  expected_outcome_gain: z.number(),
  trust_confidence: z.number(),
  compatibility_confidence: z.number(),
  novelty: z.number(),
  fatigue_penalty: z.number(),
  risk_penalty: z.number(),
});
export type NudgeRankingFeatureInput = z.infer<typeof NudgeRankingFeatureInputSchema>;

export const NudgeRankingCandidateInputSchema = z.object({
  envelope: NudgeCandidateEnvelopeSchema,
  features: NudgeRankingFeatureInputSchema,
  confidence_governance_input: ConfidenceGovernanceEvaluationInputSchema.optional(),
});
export type NudgeRankingCandidateInput = z.infer<
  typeof NudgeRankingCandidateInputSchema
>;

export const NudgeRankingRequestSchema = z.object({
  candidates: z.array(NudgeRankingCandidateInputSchema).min(1),
  policy_version: z.string().min(1).optional(),
  surface: NudgeDeliverySurfaceSchema,
  ranked_at: z.string().datetime().optional(),
});
export type NudgeRankingRequest = z.infer<typeof NudgeRankingRequestSchema>;

export const NudgeRankedDecisionSchema = z.object({
  decision: NudgeDecisionSchema,
  policy_version: z.string().min(1),
  components: NudgeRankComponentSchema,
  confidence_governance: ConfidenceGovernanceEvaluationResultSchema.optional(),
  reason_codes: z.array(NudgeReasonCodeSchema).default([]),
  evidence_refs: z.array(TraceEvidenceReferenceSchema).min(1),
  deliverable: z.boolean(),
});
export type NudgeRankedDecision = z.infer<typeof NudgeRankedDecisionSchema>;

export const NudgeRankingResultSchema = z.object({
  policy: NudgeRankingPolicySchema,
  decisions: z.array(NudgeRankedDecisionSchema).default([]),
  ranked_at: z.string().datetime(),
});
export type NudgeRankingResult = z.infer<typeof NudgeRankingResultSchema>;

export const NudgeSuppressionRecordSchema = z.object({
  suppression_id: z.string().uuid(),
  action: NudgeSuppressionActionSchema,
  scope: NudgeSuppressionScopeSchema,
  target_ref: z.string().min(1),
  requesting_project_id: ProjectIdSchema.optional(),
  surface_set: z.array(NudgeDeliverySurfaceSchema).default([]),
  reason_codes: z.array(NudgeReasonCodeSchema).default([]),
  evidence_refs: z.array(TraceEvidenceReferenceSchema).min(1),
  created_at: z.string().datetime(),
  expires_at: z.string().datetime().optional(),
});
export type NudgeSuppressionRecord = z.infer<typeof NudgeSuppressionRecordSchema>;

export const NudgeSuppressionCheckRequestSchema = z.object({
  candidate: NudgeCandidateSchema,
  surface: NudgeDeliverySurfaceSchema,
  requesting_project_id: ProjectIdSchema.optional(),
  evidence_refs: z.array(TraceEvidenceReferenceSchema).min(1),
  checked_at: z.string().datetime().optional(),
});
export type NudgeSuppressionCheckRequest = z.infer<
  typeof NudgeSuppressionCheckRequestSchema
>;

export const NudgeSuppressionCheckResultSchema = z.object({
  candidate_id: z.string().min(1),
  blocked: z.boolean(),
  matched_suppressions: z.array(NudgeSuppressionRecordSchema).default([]),
  reason_codes: z.array(NudgeReasonCodeSchema).default([]),
  evidence_refs: z.array(TraceEvidenceReferenceSchema).min(1),
  checked_at: z.string().datetime(),
});
export type NudgeSuppressionCheckResult = z.infer<
  typeof NudgeSuppressionCheckResultSchema
>;

export const NudgeDeliveryOutcomeSchema = z.enum(['delivered', 'delivery_blocked']);
export type NudgeDeliveryOutcome = z.infer<typeof NudgeDeliveryOutcomeSchema>;

export const NudgeDeliveryRecordSchema = z.object({
  delivery_id: z.string().uuid(),
  candidate_id: z.string().min(1),
  decision_id: z.string().min(1),
  surface: NudgeDeliverySurfaceSchema,
  outcome: NudgeDeliveryOutcomeSchema,
  reason_codes: z.array(NudgeReasonCodeSchema).default([]),
  evidence_refs: z.array(TraceEvidenceReferenceSchema).min(1),
  delivered_at: z.string().datetime(),
});
export type NudgeDeliveryRecord = z.infer<typeof NudgeDeliveryRecordSchema>;

export const NudgeDeliveryRecordInputSchema = NudgeDeliveryRecordSchema.omit({
  delivery_id: true,
});
export type NudgeDeliveryRecordInput = z.infer<typeof NudgeDeliveryRecordInputSchema>;

export const NudgeFeedbackEventSchema = z.object({
  feedback_id: z.string().min(1),
  candidate_id: z.string().min(1),
  event_type: z.enum([
    'opened',
    'accepted',
    'dismissed',
    'snoozed',
    'muted_category',
    'muted_project',
    'muted_global',
  ]),
  surface: NudgeDeliverySurfaceSchema,
  occurred_at: z.string().datetime(),
});
export type NudgeFeedbackEvent = z.infer<typeof NudgeFeedbackEventSchema>;

export const NudgeFeedbackRecordSchema = NudgeFeedbackEventSchema.extend({
  decision_id: z.string().min(1).optional(),
  delivery_id: z.string().uuid().optional(),
  evidence_refs: z.array(TraceEvidenceReferenceSchema).min(1),
});
export type NudgeFeedbackRecord = z.infer<typeof NudgeFeedbackRecordSchema>;

export const NudgeFeedbackRecordInputSchema = NudgeFeedbackRecordSchema.omit({
  feedback_id: true,
});
export type NudgeFeedbackRecordInput = z.infer<typeof NudgeFeedbackRecordInputSchema>;

export const NudgeAcceptanceRouteSchema = z.enum([
  'runtime_authorization_required',
  'workflow_template_draft',
  'advisory_acknowledged',
]);
export type NudgeAcceptanceRoute = z.infer<typeof NudgeAcceptanceRouteSchema>;

export const NudgeAcceptanceRouteRequestSchema = z.object({
  candidate_id: z.string().min(1),
  decision_id: z.string().min(1),
  source_type: NudgeCandidateSchema.shape.source_type,
  source_ref: z.string().min(1),
  project_id: ProjectIdSchema.optional(),
  accepted_at: z.string().datetime(),
  evidence_refs: z.array(TraceEvidenceReferenceSchema).min(1),
});
export type NudgeAcceptanceRouteRequest = z.infer<
  typeof NudgeAcceptanceRouteRequestSchema
>;

export const NudgeAcceptanceRouteResultSchema = z.object({
  route: NudgeAcceptanceRouteSchema,
  lifecycle_request_ref: z.string().min(1).optional(),
  advisory_ref: z.string().min(1).optional(),
  reason_codes: z.array(NudgeReasonCodeSchema).default([]),
  evidence_refs: z.array(TraceEvidenceReferenceSchema).min(1),
});
export type NudgeAcceptanceRouteResult = z.infer<
  typeof NudgeAcceptanceRouteResultSchema
>;
