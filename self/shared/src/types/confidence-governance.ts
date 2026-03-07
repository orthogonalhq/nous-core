/**
 * Confidence-governance coupling and Phase 6 export types for Nous-OSS.
 *
 * Phase 4.4: Confidence tier mapping, explainability, escalation signals,
 * Phase 6 intake contracts, and Phase 8.6 runtime evaluation contracts.
 */
import { z } from 'zod';
import {
  MemoryEntryIdSchema,
  ProjectIdSchema,
  TraceIdSchema,
} from './ids.js';
import { GovernanceLevelSchema, MemoryScopeSchema } from './enums.js';
import {
  CriticalActionCategorySchema,
  TraceEvidenceReferenceSchema,
} from './evidence.js';
import { ProjectControlStateSchema } from './mao.js';
import type {
  CriticalActionCategory,
  TraceEvidenceReference,
} from './evidence.js';

function evidenceRefKey(ref: TraceEvidenceReference): string {
  return JSON.stringify(
    Object.entries(ref).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function isEvidenceSubset(
  subset: TraceEvidenceReference[],
  superset: TraceEvidenceReference[],
): boolean {
  const allowed = new Set(superset.map((ref) => evidenceRefKey(ref)));
  return subset.every((ref) => allowed.has(evidenceRefKey(ref)));
}

// --- Confidence Tier ---
// Maps from ConfidenceLifecycleSchema thresholds (Phase 4.3):
// low:    confidence < 0.6 OR supportingSignals < 5
// medium: confidence in [0.6, 0.9) AND supportingSignals in [5, 15)
// high:   confidence >= 0.9 AND supportingSignals >= 15
export const ConfidenceTierSchema = z.enum(['low', 'medium', 'high']);
export type ConfidenceTier = z.infer<typeof ConfidenceTierSchema>;

export const ConfidenceDecayStateSchema = z.enum([
  'stable',
  'decaying',
  'flagged_retirement',
]);
export type ConfidenceDecayState = z.infer<typeof ConfidenceDecayStateSchema>;

// --- Confidence Governance Mapping ---
// Explicit mapping from tier to governance behavior. No opaque autonomy.
export const ConfidenceGovernanceMappingSchema = z.object({
  tier: ConfidenceTierSchema,
  escalationRequired: z.boolean(),
  mayAutonomyAllowed: z.boolean(),
  shouldFlagDeviations: z.boolean(),
  maxGovernanceForAutonomy: GovernanceLevelSchema.optional(),
});
export type ConfidenceGovernanceMapping = z.infer<
  typeof ConfidenceGovernanceMappingSchema
>;

// Canonical mapping per SDS
export const CANONICAL_CONFIDENCE_GOVERNANCE_MAPPING: ConfidenceGovernanceMapping[] =
  [
    {
      tier: 'low',
      escalationRequired: true,
      mayAutonomyAllowed: false,
      shouldFlagDeviations: true,
    },
    {
      tier: 'medium',
      escalationRequired: false,
      mayAutonomyAllowed: false,
      shouldFlagDeviations: true,
    },
    {
      tier: 'high',
      escalationRequired: false,
      mayAutonomyAllowed: true,
      shouldFlagDeviations: false,
      maxGovernanceForAutonomy: 'may',
    },
  ];

// --- High-Risk Action Categories (ADR-004 Override) ---
// Regardless of confidence tier, these always require confirmation/authorization.
export const HIGH_RISK_ACTION_CATEGORIES: CriticalActionCategory[] = [
  'tool-execute',
  'memory-write',
  'opctl-command',
];

// --- Learned Behavior Explanation ---
// What pattern influenced which outcome; trace links to canonical truth.
export const LearnedBehaviorExplanationSchema = z.object({
  patternId: MemoryEntryIdSchema,
  outcomeRef: z.string().min(1),
  evidenceRefs: z.array(TraceEvidenceReferenceSchema).min(1),
  distillationRef: z.string().optional(),
  policyRef: z.string().optional(),
  controlStateRef: z.string().optional(),
});
export type LearnedBehaviorExplanation = z.infer<
  typeof LearnedBehaviorExplanationSchema
>;

// --- Escalation Signal ---
// Deterministic failure and rollback signaling for low-confidence or contradiction.
export const EscalationSignalReasonCodeSchema = z.enum([
  'CONF-LOW',
  'CONF-CONTRADICTION',
  'CONF-STALENESS',
  'CONF-RETIREMENT',
]);
export type EscalationSignalReasonCode = z.infer<
  typeof EscalationSignalReasonCodeSchema
>;

export const EscalationSignalSchema = z.object({
  reasonCode: EscalationSignalReasonCodeSchema,
  traceId: TraceIdSchema,
  evidenceRefs: z.array(TraceEvidenceReferenceSchema).min(1),
  patternId: MemoryEntryIdSchema.optional(),
  detail: z.record(z.unknown()).optional(),
});
export type EscalationSignal = z.infer<typeof EscalationSignalSchema>;

// --- Phase 6 Export Contracts ---

export const Phase6DistilledPatternExportSchema = z.object({
  id: MemoryEntryIdSchema,
  content: z.string(),
  confidence: z.number().min(0).max(1),
  basedOn: z.array(MemoryEntryIdSchema),
  supersedes: z.array(MemoryEntryIdSchema),
  evidenceRefs: z.array(TraceEvidenceReferenceSchema),
  projectId: ProjectIdSchema.optional(),
  scope: MemoryScopeSchema,
  tags: z.array(z.string()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Phase6DistilledPatternExport = z.infer<
  typeof Phase6DistilledPatternExportSchema
>;

export const Phase6ConfidenceSignalExportSchema = z.object({
  tier: ConfidenceTierSchema,
  confidence: z.number().min(0).max(1),
  supportingSignals: z.number().int().min(0),
  patternId: MemoryEntryIdSchema.optional(),
  entryId: MemoryEntryIdSchema.optional(),
  decayState: ConfidenceDecayStateSchema.optional(),
});
export type Phase6ConfidenceSignalExport = z.infer<
  typeof Phase6ConfidenceSignalExportSchema
>;

export const Phase6EvidenceLinkageExpectationsSchema = z.object({
  traceLinksRequired: z.boolean(),
  canonicalRefsRequired: z.boolean(),
  deterministicLinkage: z.boolean(),
});
export type Phase6EvidenceLinkageExpectations = z.infer<
  typeof Phase6EvidenceLinkageExpectationsSchema
>;

// --- Phase 8.6 Runtime Evaluation Contracts ---

export const ConfidenceGovernanceDecisionOutcomeSchema = z.enum([
  'allow_autonomy',
  'allow_with_flag',
  'escalate',
  'defer',
  'deny',
]);
export type ConfidenceGovernanceDecisionOutcome = z.infer<
  typeof ConfidenceGovernanceDecisionOutcomeSchema
>;

export const ConfidenceGovernanceDecisionReasonCodeSchema = z.enum([
  'CGR-ALLOW-AUTONOMY',
  'CGR-ALLOW-WITH-FLAG',
  'CGR-ESCALATE-LOW-CONFIDENCE',
  'CGR-ESCALATE-CONTRADICTION',
  'CGR-ESCALATE-STALENESS',
  'CGR-ESCALATE-RETIREMENT',
  'CGR-DEFER-HIGH-RISK-CONFIRMATION',
  'CGR-DEFER-PAUSED-REVIEW',
  'CGR-DEFER-RESUMING',
  'CGR-DENY-HARD-STOPPED',
  'CGR-DENY-GOVERNANCE-CEILING',
  'CGR-DENY-MISSING-ESCALATION-CONTEXT',
]);
export type ConfidenceGovernanceDecisionReasonCode = z.infer<
  typeof ConfidenceGovernanceDecisionReasonCodeSchema
>;

export const ConfidenceGovernanceEvaluationInputSchema = z
  .object({
    governance: GovernanceLevelSchema,
    actionCategory: CriticalActionCategorySchema,
    projectControlState: ProjectControlStateSchema.optional(),
    pattern: Phase6DistilledPatternExportSchema,
    confidenceSignal: Phase6ConfidenceSignalExportSchema,
    explanation: LearnedBehaviorExplanationSchema,
    escalationSignal: EscalationSignalSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.pattern.evidenceRefs.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'pattern evidenceRefs must be non-empty',
        path: ['pattern', 'evidenceRefs'],
      });
    }

    if (value.explanation.patternId !== value.pattern.id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'explanation.patternId must match pattern.id',
        path: ['explanation', 'patternId'],
      });
    }

    if (
      value.confidenceSignal.patternId &&
      value.confidenceSignal.patternId !== value.pattern.id
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'confidenceSignal.patternId must match pattern.id',
        path: ['confidenceSignal', 'patternId'],
      });
    }

    if (
      value.confidenceSignal.entryId &&
      value.confidenceSignal.entryId !== value.pattern.id
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'confidenceSignal.entryId must match pattern.id',
        path: ['confidenceSignal', 'entryId'],
      });
    }

    if (
      value.escalationSignal?.patternId &&
      value.escalationSignal.patternId !== value.pattern.id
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'escalationSignal.patternId must match pattern.id',
        path: ['escalationSignal', 'patternId'],
      });
    }

    if (
      !isEvidenceSubset(
        value.explanation.evidenceRefs,
        value.pattern.evidenceRefs,
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'explanation.evidenceRefs must align to the canonical pattern evidenceRefs',
        path: ['explanation', 'evidenceRefs'],
      });
    }
  });
export type ConfidenceGovernanceEvaluationInput = z.infer<
  typeof ConfidenceGovernanceEvaluationInputSchema
>;

export const ConfidenceGovernanceEvaluationResultSchema = z
  .object({
    outcome: ConfidenceGovernanceDecisionOutcomeSchema,
    reasonCode: ConfidenceGovernanceDecisionReasonCodeSchema,
    governance: GovernanceLevelSchema,
    actionCategory: CriticalActionCategorySchema,
    projectControlState: ProjectControlStateSchema.optional(),
    patternId: MemoryEntryIdSchema,
    confidence: z.number().min(0).max(1),
    confidenceTier: ConfidenceTierSchema,
    supportingSignals: z.number().int().min(0),
    decayState: ConfidenceDecayStateSchema.optional(),
    autonomyAllowed: z.boolean(),
    requiresConfirmation: z.boolean(),
    highRiskOverrideApplied: z.boolean(),
    evidenceRefs: z.array(TraceEvidenceReferenceSchema).min(1),
    explanation: LearnedBehaviorExplanationSchema,
    escalationSignal: EscalationSignalSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.outcome === 'allow_autonomy' && !value.autonomyAllowed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'allow_autonomy outcomes must set autonomyAllowed=true',
        path: ['autonomyAllowed'],
      });
    }

    if (value.outcome !== 'allow_autonomy' && value.autonomyAllowed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'only allow_autonomy outcomes may set autonomyAllowed=true',
        path: ['autonomyAllowed'],
      });
    }

    if (
      value.highRiskOverrideApplied &&
      value.reasonCode !== 'CGR-DEFER-HIGH-RISK-CONFIRMATION'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'highRiskOverrideApplied results must use CGR-DEFER-HIGH-RISK-CONFIRMATION',
        path: ['reasonCode'],
      });
    }

    if (
      value.requiresConfirmation &&
      value.reasonCode !== 'CGR-DEFER-HIGH-RISK-CONFIRMATION'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'requiresConfirmation may only be true for the high-risk confirmation defer path',
        path: ['requiresConfirmation'],
      });
    }

    if (
      value.reasonCode === 'CGR-DEFER-HIGH-RISK-CONFIRMATION' &&
      (!value.highRiskOverrideApplied ||
        !value.requiresConfirmation ||
        value.outcome !== 'defer')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'high-risk confirmation defer results must set defer outcome, requiresConfirmation=true, and highRiskOverrideApplied=true',
        path: ['reasonCode'],
      });
    }

    if (value.outcome === 'escalate' && !value.escalationSignal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'escalate outcomes require escalationSignal context',
        path: ['escalationSignal'],
      });
    }

    if (
      value.reasonCode === 'CGR-DENY-MISSING-ESCALATION-CONTEXT' &&
      value.escalationSignal
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'missing-escalation-context deny results must not carry escalationSignal',
        path: ['escalationSignal'],
      });
    }
  });
export type ConfidenceGovernanceEvaluationResult = z.infer<
  typeof ConfidenceGovernanceEvaluationResultSchema
>;
