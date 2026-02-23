/**
 * MwcEvaluator — internal type for MemoryWriteCandidate evaluation.
 *
 * Phase 1.4 uses a stub that approves all. Phase 1.5 will inject Cortex evaluator.
 */
import type { MemoryWriteCandidate, ProjectId } from '@nous/shared';
import type { MemoryMutationRequest } from '@nous/shared';

export type MwcEvaluator = (
  candidate: MemoryWriteCandidate,
  projectId?: ProjectId,
) => Promise<{ approved: boolean; reason?: string }>;

export type MemoryMutationEvaluator = (
  request: MemoryMutationRequest,
  projectId?: ProjectId,
) => Promise<{ approved: boolean; reason?: string; reasonCode?: string }>;

/**
 * Creates a stub evaluator that approves all candidates.
 * Used in Phase 1.4; Phase 1.5 will provide Cortex-based evaluator.
 */
export function createStubEvaluator(): MwcEvaluator {
  return async () => ({ approved: true });
}

/**
 * Creates a stub mutation evaluator.
 * By default, blocks direct core/tool actor mutation attempts and
 * allows all other actions.
 */
export function createStubMutationEvaluator(): MemoryMutationEvaluator {
  return async (request) => {
    if (request.actor === 'core' || request.actor === 'tool') {
      return {
        approved: false,
        reason: 'direct mutation actor blocked',
        reasonCode: 'MEM-ACTOR-BOUNDARY-BLOCKED',
      };
    }
    if (
      request.action === 'hard-delete' &&
      request.actor !== 'principal' &&
      !request.principalOverride?.rationale
    ) {
      return {
        approved: false,
        reason: 'hard delete requires principal override',
        reasonCode: 'MEM-HARD-DELETE-REQUIRES-OVERRIDE',
      };
    }
    return { approved: true, reason: 'stub approved', reasonCode: 'MEM-APPROVED' };
  };
}
