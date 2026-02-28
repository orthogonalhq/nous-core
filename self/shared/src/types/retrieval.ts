/**
 * Retrieval domain types for Nous-OSS.
 *
 * Phase 4.2: RetrievalResponse, RetrievalBudgetTelemetry, RetrievalScoringWeights.
 * Phase 6.1: selectionAudit for cross-project retrieval audit trail.
 */
import { z } from 'zod';
import { RetrievalResultSchema } from './memory.js';
import { PolicyDecisionRecordSchema } from './policy.js';
import { SelectionAuditSchema } from './cross-project-retrieval.js';

// --- Retrieval Response ---
// Phase 4.2: Extends return for denial traceability. When policy denies, policyDenial is set.
// Phase 6.1: selectionAudit for cross-project retrieval audit trail.
export const RetrievalResponseSchema = z.object({
  results: z.array(RetrievalResultSchema),
  policyDenial: PolicyDecisionRecordSchema.optional(),
  selectionAudit: SelectionAuditSchema.optional(),
});
export type RetrievalResponse = z.infer<typeof RetrievalResponseSchema>;

// --- Retrieval Budget Telemetry ---
// Emitted per retrieval for audit and benchmark evidence.
export const RetrievalBudgetTelemetrySchema = z.object({
  consumedTokens: z.number().int().min(0),
  candidateCount: z.number().int().min(0),
  truncatedCount: z.number().int().min(0),
});
export type RetrievalBudgetTelemetry = z.infer<
  typeof RetrievalBudgetTelemetrySchema
>;

// --- Retrieval Scoring Weights ---
// Configurable weights for sentiment-weighted retrieval. Must sum to 1.
export const RetrievalScoringWeightsSchema = z
  .object({
    wSimilarity: z.number().min(0).max(1),
    wSentiment: z.number().min(0).max(1),
    wRecency: z.number().min(0).max(1),
    wConfidence: z.number().min(0).max(1),
  })
  .refine(
    (w) =>
      Math.abs(
        w.wSimilarity + w.wSentiment + w.wRecency + w.wConfidence - 1,
      ) < 1e-6,
    { message: 'Weights must sum to 1' },
  );
export type RetrievalScoringWeights = z.infer<
  typeof RetrievalScoringWeightsSchema
>;

/** Default weights: semantic relevance primary, sentiment secondary. */
export const DEFAULT_RETRIEVAL_WEIGHTS: RetrievalScoringWeights = {
  wSimilarity: 0.5, // Primary: semantic relevance
  wSentiment: 0.25, // Outcome valence strength
  wRecency: 0.15, // Recency decay
  wConfidence: 0.1, // Entry confidence
};
