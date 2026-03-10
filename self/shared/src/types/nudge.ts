import { z } from 'zod';
import {
  RegistryCompatibilityStateSchema,
  RegistryTrustTierSchema,
} from './registry.js';

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

export const NudgeDecisionSchema = z.object({
  decision_id: z.string().min(1),
  candidate_id: z.string().min(1),
  rank_score: z.number(),
  rank_components_ref: z.string().min(1),
  suppression_state: z.string().min(1),
  delivery_surface_set: z.array(z.string().min(1)).default([]),
  expires_at: z.string().datetime(),
});
export type NudgeDecision = z.infer<typeof NudgeDecisionSchema>;

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
  surface: z.string().min(1),
  occurred_at: z.string().datetime(),
});
export type NudgeFeedbackEvent = z.infer<typeof NudgeFeedbackEventSchema>;
