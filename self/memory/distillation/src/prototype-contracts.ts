import { z } from 'zod';
import type {
  ExperienceCluster,
  MemoryEntryId,
  TraceEvidenceReference,
} from '@nous/shared';
import {
  ExperienceClusterSchema,
  MemoryEntryIdSchema,
  TraceEvidenceReferenceSchema,
} from '@nous/shared';

export const DEFAULT_PROTOTYPE_EVALUATION_REFERENCE_AT =
  '2026-03-07T00:00:00.000Z';

export const DistillationPrototypeCandidateIdSchema = z.enum([
  'baseline-current-engine',
  'structured-summary-v1',
]);
export type DistillationPrototypeCandidateId = z.infer<
  typeof DistillationPrototypeCandidateIdSchema
>;

export const PrototypePromotionDecisionSchema = z.enum([
  'promote',
  'hold',
  'reject',
]);
export type PrototypePromotionDecision = z.infer<
  typeof PrototypePromotionDecisionSchema
>;

export const PrototypeContradictionStatusSchema = z.enum([
  'none',
  'detected',
  'blocking',
]);
export type PrototypeContradictionStatus = z.infer<
  typeof PrototypeContradictionStatusSchema
>;

export const PrototypeStalenessStatusSchema = z.enum([
  'fresh',
  'aging',
  'stale',
]);
export type PrototypeStalenessStatus = z.infer<
  typeof PrototypeStalenessStatusSchema
>;

export const DistillationPrototypeScenarioSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  cluster: ExperienceClusterSchema,
  evaluationWindowDays: z.number().int().positive(),
  expected: z.object({
    promotionDecision: PrototypePromotionDecisionSchema,
    contradictionStatus: PrototypeContradictionStatusSchema,
    stalenessStatus: PrototypeStalenessStatusSchema,
    requiresFullTraceCoverage: z.literal(true),
    requiresSupersessionBlockOnFailure: z.literal(true),
  }),
});
export type DistillationPrototypeScenario = z.infer<
  typeof DistillationPrototypeScenarioSchema
>;

export const DistillationPrototypeProposalSchema = z.object({
  candidateId: DistillationPrototypeCandidateIdSchema,
  scenarioId: z.string().min(1),
  content: z.string().min(1),
  basedOn: z.array(MemoryEntryIdSchema).min(1),
  evidenceRefs: z.array(TraceEvidenceReferenceSchema).min(1),
  supersedes: z.array(MemoryEntryIdSchema),
  proposedConfidence: z.number().min(0).max(1).optional(),
  promotionDecision: PrototypePromotionDecisionSchema,
  contradictionStatus: PrototypeContradictionStatusSchema,
  stalenessStatus: PrototypeStalenessStatusSchema,
  supersessionEligible: z.boolean(),
  rationale: z.array(z.string()).min(1),
});
export type DistillationPrototypeProposal = z.infer<
  typeof DistillationPrototypeProposalSchema
>;

export const DistillationEvaluationVerdictSchema = z.object({
  correctness: z.enum(['pass', 'fail']),
  explainability: z.enum(['pass', 'fail']),
  traceability: z.enum(['pass', 'fail']),
  contradictionHandling: z.enum(['pass', 'fail']),
  stalenessBehavior: z.enum(['pass', 'fail']),
});
export type DistillationEvaluationVerdict = z.infer<
  typeof DistillationEvaluationVerdictSchema
>;

export const DistillationEvaluationResultSchema = z.object({
  candidateId: DistillationPrototypeCandidateIdSchema,
  baselineCandidateId: DistillationPrototypeCandidateIdSchema.optional(),
  scenarioId: z.string().min(1),
  verdict: DistillationEvaluationVerdictSchema,
  overallDecision: z.enum(['go', 'no-go']),
  failureReasons: z.array(z.string()),
});
export type DistillationEvaluationResult = z.infer<
  typeof DistillationEvaluationResultSchema
>;

export const DistillationPrototypeCandidateSummarySchema = z.object({
  candidateId: DistillationPrototypeCandidateIdSchema,
  scenarioResults: z.array(DistillationEvaluationResultSchema),
  passCount: z.number().int().min(0),
  failCount: z.number().int().min(0),
  overallDecision: z.enum(['go', 'no-go']),
});
export type DistillationPrototypeCandidateSummary = z.infer<
  typeof DistillationPrototypeCandidateSummarySchema
>;

export const DistillationPrototypeRecommendationSchema = z.object({
  decision: z.enum(['go', 'no-go']),
  recommendedCandidateId: DistillationPrototypeCandidateIdSchema.optional(),
  rationale: z.array(z.string()).min(1),
});
export type DistillationPrototypeRecommendation = z.infer<
  typeof DistillationPrototypeRecommendationSchema
>;

export const DistillationPrototypeSuiteEvaluationSchema = z.object({
  summaries: z.array(DistillationPrototypeCandidateSummarySchema).min(1),
  recommendation: DistillationPrototypeRecommendationSchema,
});
export type DistillationPrototypeSuiteEvaluation = z.infer<
  typeof DistillationPrototypeSuiteEvaluationSchema
>;

export interface DistillationPrototypeCandidate {
  readonly id: DistillationPrototypeCandidateId;
  propose(
    scenario: DistillationPrototypeScenario,
  ): Promise<DistillationPrototypeProposal>;
}

export interface PrototypeSignalAnalysis {
  readonly basedOn: MemoryEntryId[];
  readonly contradictionStatus: PrototypeContradictionStatus;
  readonly stalenessStatus: PrototypeStalenessStatus;
  readonly promotionDecision: PrototypePromotionDecision;
  readonly supersessionEligible: boolean;
  readonly evidenceRefs: TraceEvidenceReference[];
  readonly positiveCount: number;
  readonly negativeCount: number;
  readonly neutralCount: number;
  readonly latestAgeDays: number;
}

export function createSyntheticEvidenceRefs(
  sourceCount: number,
): TraceEvidenceReference[] {
  return Array.from({
    length: Math.max(1, Math.min(sourceCount, 3)),
  }).map(() => ({
    actionCategory: 'memory-write',
  }));
}

export function sortMemoryEntryIds(ids: MemoryEntryId[]): MemoryEntryId[] {
  return [...ids].sort((a, b) => a.localeCompare(b));
}

export function sortClusterRecords(cluster: ExperienceCluster) {
  return [...cluster.records].sort((a, b) => a.id.localeCompare(b.id));
}
