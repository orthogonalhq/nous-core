/**
 * Skill creator admission and benchmark attribution contracts.
 *
 * Phase 7.5 — Skill Creator Admission and Benchmark Attribution.
 */
import { z } from 'zod';
import { WorkmodeIdSchema } from './workmode.js';
import {
  LegacyWorkflowRefsSchema,
  SkillPackageKindSchema,
  SkillResourceRefsSchema,
} from './package-documents.js';

export const SKILL_ADMISSION_EVENT_TYPES = [
  'skill_creator_started',
  'skill_artifact_changed',
  'skill_contract_validation_passed',
  'skill_contract_validation_failed',
  'skill_bench_run_started',
  'skill_bench_run_completed',
  'skill_bench_run_invalidated',
  'skill_attribution_thesis_generated',
  'skill_admission_requested',
  'skill_admitted',
  'skill_admission_blocked',
  'skill_promoted',
  'skill_held',
  'skill_rolled_back',
] as const;
export const SkillAdmissionEventTypeSchema = z.enum(SKILL_ADMISSION_EVENT_TYPES);
export type SkillAdmissionEventType = z.infer<typeof SkillAdmissionEventTypeSchema>;

export const SKILL_ADMISSION_REASON_CODES = {
  'SCM-001-WORKMODE-REQUIRED':
    'Skill authoring and admission workflow must run under system:skill_authoring.',
  'SCM-003-WORKER-SELF-PROMOTION':
    'Worker-originated self-promotion request is not permitted.',
  'SCM-004-CONTRACT-VALIDATION-REQUIRED':
    'Skill contract validation pass is required before admission.',
  'SCM-004-BENCH-EVIDENCE-REQUIRED':
    'SkillBench evidence is required before admission.',
  'SCM-004-THESIS-REQUIRED':
    'Attribution thesis evidence is required before admission.',
  'SCM-004-INCONCLUSIVE-ATTRIBUTION':
    'Attribution is inconclusive and cannot justify promotion.',
  'SCM-005-MODEL-DRIFT':
    'Benchmark runs drifted from the fixed model profile lock.',
  'SCM-007-RUNTIME-CONTRACT-MISSING':
    'Required runtime skill contract artifacts are missing.',
  'SCM-007-FLOW-STEPS-MISSING':
    'Skill flow declares graph mode but no step refs were provided.',
  'SCM-008-TRUST-REGRESSION':
    'Safety or trust regression blocks promotion.',
  'SKADM-001-DECISION-NOT-PENDING':
    'Cortex decision requires a pending_cortex admission state.',
  'SKADM-002-CORTEX-AUTH-REQUIRED':
    'Only nous_cortex can finalize admission/promotion decisions.',
  'SKADM-003-INVALID-REQUEST':
    'Skill admission request payload is invalid.',
  'EVID-001-MISSING-WITNESS':
    'Required witness linkage was missing from admission events.',
} as const;

export const SkillAdmissionReasonCodeSchema = z
  .string()
  .regex(
    /^(SCM-00[1-8]|SKADM|EVID|BENCH|WMODE|POL|PKG|OPCTL)-[A-Z0-9][A-Z0-9_-]*$/,
  );
export type SkillAdmissionReasonCode = z.infer<typeof SkillAdmissionReasonCodeSchema>;

const SkillActorSchema = z.enum([
  'nous_cortex',
  'orchestration_agent',
  'worker_agent',
]);
export type SkillActor = z.infer<typeof SkillActorSchema>;

export const SkillRuntimeArtifactSchema = z.object({
  skill_id: z.string().min(1),
  revision_id: z.string().min(1),
  skill_root_ref: z.string().min(1),
  has_skill_md: z.boolean(),
  manifest_ref: z.string().min(1).optional(),
  skill_package_kind: SkillPackageKindSchema.default('atomic'),
  resource_refs: SkillResourceRefsSchema.default({
    references: [],
    scripts: [],
    assets: [],
  }),
  legacy_workflow_refs: LegacyWorkflowRefsSchema.optional(),
  agents_openai_yaml_ref: z.string().min(1).optional(),
  changelog_ref: z.string().min(1).optional(),
});
export type SkillRuntimeArtifact = z.infer<typeof SkillRuntimeArtifactSchema>;

export const SkillContractValidationRequestSchema = z.object({
  skill_id: z.string().min(1),
  revision_id: z.string().min(1),
  artifact: SkillRuntimeArtifactSchema,
  authoring_workmode: WorkmodeIdSchema,
  actor_id: z.string().min(1),
});
export type SkillContractValidationRequest = z.infer<
  typeof SkillContractValidationRequestSchema
>;

export const SkillContractViolationSchema = z.object({
  code: SkillAdmissionReasonCodeSchema,
  detail: z.string().min(1),
  evidence_refs: z.array(z.string().min(1)).min(1),
});
export type SkillContractViolation = z.infer<typeof SkillContractViolationSchema>;

export const SkillContractValidationResultSchema = z.object({
  skill_id: z.string().min(1),
  revision_id: z.string().min(1),
  passed: z.boolean(),
  violations: z.array(SkillContractViolationSchema),
  witness_ref: z.string().min(1),
  evidence_refs: z.array(z.string().min(1)).min(1),
});
export type SkillContractValidationResult = z.infer<
  typeof SkillContractValidationResultSchema
>;

export const SkillBenchEvidenceSchema = z.object({
  benchmark_pack_ref: z.string().min(1),
  model_profile_locked: z.string().min(1),
  baseline_revision_ref: z.string().min(1),
  candidate_revision_ref: z.string().min(1),
  seed_set_ref: z.string().min(1),
  run_record_refs: z.array(z.string().min(1)).min(1),
  score_report_refs: z.array(z.string().min(1)).min(1),
  trace_bundle_refs: z.array(z.string().min(1)).min(1),
  drift_detected: z.boolean(),
  drift_reason_code: SkillAdmissionReasonCodeSchema.optional(),
});
export type SkillBenchEvidence = z.infer<typeof SkillBenchEvidenceSchema>;

export const SkillBenchEvaluationRequestSchema = z.object({
  skill_id: z.string().min(1),
  revision_id: z.string().min(1),
  evidence: SkillBenchEvidenceSchema,
  actor_id: z.string().min(1),
});
export type SkillBenchEvaluationRequest = z.infer<
  typeof SkillBenchEvaluationRequestSchema
>;

export const SkillBenchEvaluationResultSchema = z
  .object({
    skill_id: z.string().min(1),
    revision_id: z.string().min(1),
    passed: z.boolean(),
    drift_detected: z.boolean(),
    reason_code: SkillAdmissionReasonCodeSchema.optional(),
    witness_ref: z.string().min(1),
    evidence_refs: z.array(z.string().min(1)).min(1),
    benchmark_evidence: SkillBenchEvidenceSchema,
  })
  .superRefine((value, ctx) => {
    if ((!value.passed || value.drift_detected) && !value.reason_code) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason_code'],
        message: 'reason_code is required when benchmark evaluation is blocked',
      });
    }
  });
export type SkillBenchEvaluationResult = z.infer<
  typeof SkillBenchEvaluationResultSchema
>;

export const UpliftSourceSchema = z.enum([
  'skill_logic',
  'retrieval_profile',
  'combined',
  'inconclusive',
]);
export type UpliftSource = z.infer<typeof UpliftSourceSchema>;

export const SkillAttributionThesisSchema = z.object({
  thesis_ref: z.string().min(1),
  hypothesis: z.string().min(1),
  method: z.string().min(1),
  results_summary: z.string().min(1),
  uplift_source: UpliftSourceSchema,
  risk_summary: z.string().min(1),
  recommendation: z.enum(['promote', 'hold', 'rollback']),
  evidence_refs: z.array(z.string().min(1)).min(1),
});
export type SkillAttributionThesis = z.infer<typeof SkillAttributionThesisSchema>;

export const SkillAttributionThesisRequestSchema = z.object({
  skill_id: z.string().min(1),
  revision_id: z.string().min(1),
  thesis: SkillAttributionThesisSchema,
  actor_id: z.string().min(1),
});
export type SkillAttributionThesisRequest = z.infer<
  typeof SkillAttributionThesisRequestSchema
>;

export const SkillAttributionThesisResultSchema = z
  .object({
    skill_id: z.string().min(1),
    revision_id: z.string().min(1),
    passed: z.boolean(),
    thesis: SkillAttributionThesisSchema,
    reason_code: SkillAdmissionReasonCodeSchema.optional(),
    witness_ref: z.string().min(1),
    evidence_refs: z.array(z.string().min(1)).min(1),
  })
  .superRefine((value, ctx) => {
    if (!value.passed && !value.reason_code) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason_code'],
        message: 'reason_code is required when thesis evaluation is blocked',
      });
    }
  });
export type SkillAttributionThesisResult = z.infer<
  typeof SkillAttributionThesisResultSchema
>;

export const SkillAdmissionRequestSchema = z.object({
  skill_id: z.string().min(1),
  revision_id: z.string().min(1),
  requested_by: SkillActorSchema,
  requested_decision: z.enum(['admit', 'promote']),
  validation: SkillContractValidationResultSchema,
  benchmark: SkillBenchEvaluationResultSchema,
  thesis: SkillAttributionThesisResultSchema,
  safety_regression_open: z.boolean().default(false),
  trust_regression_open: z.boolean().default(false),
  admission_request_ref: z.string().min(1).optional(),
});
export type SkillAdmissionRequest = z.infer<typeof SkillAdmissionRequestSchema>;

export const SkillAdmissionDecisionSchema = z.enum([
  'pending_cortex',
  'admitted',
  'blocked',
  'promoted',
  'held',
  'rolled_back',
]);
export type SkillAdmissionDecision = z.infer<typeof SkillAdmissionDecisionSchema>;

const SkillAdmissionResultBaseSchema = z.object({
  skill_id: z.string().min(1),
  revision_id: z.string().min(1),
  decision: SkillAdmissionDecisionSchema,
  reason_code: SkillAdmissionReasonCodeSchema.optional(),
  evidence_refs: z.array(z.string().min(1)).min(1),
  witness_ref: z.string().min(1),
  benchmark_evidence_ref: z.string().min(1).optional(),
  attribution_thesis_ref: z.string().min(1).optional(),
  decided_by: SkillActorSchema,
  decided_at: z.string().datetime(),
  state_version: z.number().int().positive().optional(),
});

export const SkillAdmissionResultSchema = SkillAdmissionResultBaseSchema
  .superRefine((value, ctx) => {
    const requiresReason =
      value.decision === 'blocked' ||
      value.decision === 'held' ||
      value.decision === 'rolled_back';
    if (requiresReason && !value.reason_code) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason_code'],
        message: 'reason_code is required for blocked/held/rolled_back decisions',
      });
    }
  });
export type SkillAdmissionResult = z.infer<typeof SkillAdmissionResultSchema>;

export const SkillAdmissionDecisionInputSchema = z.object({
  skill_id: z.string().min(1),
  revision_id: z.string().min(1),
  decision: z.enum(['admitted', 'blocked', 'promoted', 'held', 'rolled_back']),
  decided_by: z.literal('nous_cortex'),
  reason_code: SkillAdmissionReasonCodeSchema.optional(),
  evidence_refs: z.array(z.string().min(1)).min(1),
});
export type SkillAdmissionDecisionInput = z.infer<
  typeof SkillAdmissionDecisionInputSchema
>;

export const SkillAdmissionDecisionRecordSchema =
  SkillAdmissionResultBaseSchema.extend({
    state_version: z.number().int().positive(),
    updated_at: z.string().datetime(),
  }).superRefine((value, ctx) => {
    const requiresReason =
      value.decision === 'blocked' ||
      value.decision === 'held' ||
      value.decision === 'rolled_back';
    if (requiresReason && !value.reason_code) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason_code'],
        message: 'reason_code is required for blocked/held/rolled_back decisions',
      });
    }
  });
export type SkillAdmissionDecisionRecord = z.infer<
  typeof SkillAdmissionDecisionRecordSchema
>;

export const SkillAdmissionEventSchema = z.object({
  event_type: SkillAdmissionEventTypeSchema,
  skill_id: z.string().min(1),
  revision_id: z.string().min(1),
  reason_code: SkillAdmissionReasonCodeSchema.optional(),
  witness_ref: z.string().min(1),
  evidence_refs: z.array(z.string().min(1)).min(1),
  occurred_at: z.string().datetime(),
});
export type SkillAdmissionEvent = z.infer<typeof SkillAdmissionEventSchema>;
