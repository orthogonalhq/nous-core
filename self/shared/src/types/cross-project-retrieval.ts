/**
 * Cross-project retrieval contract types for Nous-OSS.
 *
 * Phase 6.1: Selection policy, selection audit, and cross-project retrieval semantics.
 * Aligns with Phase 4.4 evidence linkage (traceId optional; evidenceRefs via PolicyDecisionRecord).
 */
import { z } from 'zod';
import { ProjectIdSchema } from './ids.js';
import { TraceIdSchema } from './ids.js';

// --- Cross-Project Selection Policy ---
// Governs token budget, result cap, and policy-denial suppression for cross-project queries.
export const CrossProjectSelectionPolicySchema = z.object({
  tokenBudget: z.number().int().min(1),
  resultCap: z.number().int().min(1),
  policyDenialSuppression: z.literal(true), // No recommendation path bypasses policy denial
});
export type CrossProjectSelectionPolicy = z.infer<
  typeof CrossProjectSelectionPolicySchema
>;

export const DEFAULT_CROSS_PROJECT_SELECTION_POLICY: CrossProjectSelectionPolicy =
  {
    tokenBudget: 500,
    resultCap: 20,
    policyDenialSuppression: true,
  };

// --- Selection Audit ---
// Audit trail for why results were selected. Phase 4.4: traceId optional for linkage.
export const SelectionAuditSchema = z.object({
  traceId: TraceIdSchema.optional(),
  projectIdsQueried: z.array(ProjectIdSchema),
  candidateCount: z.number().int().min(0),
  resultCount: z.number().int().min(0),
  truncationReason: z
    .enum(['token_budget', 'result_cap', 'none'])
    .optional(),
});
export type SelectionAudit = z.infer<typeof SelectionAuditSchema>;
