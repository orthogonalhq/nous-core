/**
 * MwcEvaluator — internal type for MemoryWriteCandidate evaluation.
 *
 * Phase 1.4 uses a stub that approves all. Phase 1.5 will inject PFC evaluator.
 */
import type { MemoryWriteCandidate, ProjectId } from '@nous/shared';

export type MwcEvaluator = (
  candidate: MemoryWriteCandidate,
  projectId?: ProjectId,
) => Promise<{ approved: boolean; reason?: string }>;

/**
 * Creates a stub evaluator that approves all candidates.
 * Used in Phase 1.4; Phase 1.5 will provide PFC-based evaluator.
 */
export function createStubEvaluator(): MwcEvaluator {
  return async () => ({ approved: true });
}
