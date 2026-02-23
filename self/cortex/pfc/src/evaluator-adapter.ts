/**
 * createPfcEvaluator — Adapter from IPfcEngine.evaluateMemoryWrite to MwcEvaluator.
 *
 * Used to wire MwcPipeline with Cortex-based evaluation. cortex-Cortex exports this;
 * the caller (core or app) injects it into MwcPipeline.
 */
import type {
  IPfcEngine,
  MemoryMutationRequest,
  MemoryWriteCandidate,
  ProjectId,
} from '@nous/shared';

/** Structural type compatible with MwcEvaluator from @nous/memory-mwc */
export type PfcMwcEvaluator = (
  candidate: MemoryWriteCandidate,
  projectId?: ProjectId,
) => Promise<{ approved: boolean; reason?: string }>;

/** Structural type compatible with MemoryMutationEvaluator from @nous/memory-mwc */
export type PfcMwcMutationEvaluator = (
  request: MemoryMutationRequest,
  projectId?: ProjectId,
) => Promise<{ approved: boolean; reason?: string; reasonCode?: string }>;

/**
 * Creates an evaluator that delegates to the Cortex's evaluateMemoryWrite.
 */
export function createPfcEvaluator(Cortex: IPfcEngine): PfcMwcEvaluator {
  return async (
    candidate: MemoryWriteCandidate,
    projectId?: ProjectId,
  ): Promise<{ approved: boolean; reason?: string }> => {
    const decision = await Cortex.evaluateMemoryWrite(candidate, projectId);
    return {
      approved: decision.approved,
      reason: decision.reason,
    };
  };
}

/**
 * Creates a mutation evaluator that delegates to the Cortex's
 * evaluateMemoryMutation decision path.
 */
export function createPfcMutationEvaluator(
  Cortex: IPfcEngine,
): PfcMwcMutationEvaluator {
  return async (
    request: MemoryMutationRequest,
    projectId?: ProjectId,
  ): Promise<{ approved: boolean; reason?: string; reasonCode?: string }> => {
    const decision = await Cortex.evaluateMemoryMutation(request, projectId);
    const reasonCode = decision.reason.startsWith('MEM-')
      ? decision.reason
      : undefined;
    return {
      approved: decision.approved,
      reason: decision.reason,
      reasonCode,
    };
  };
}
