/**
 * createPfcEvaluator — Adapter from IPfcEngine.evaluateMemoryWrite to MwcEvaluator.
 *
 * Used to wire MwcPipeline with PFC-based evaluation. cortex-pfc exports this;
 * the caller (core or app) injects it into MwcPipeline.
 */
import type {
  IPfcEngine,
  MemoryWriteCandidate,
  ProjectId,
} from '@nous/shared';

/** Structural type compatible with MwcEvaluator from @nous/memory-mwc */
export type PfcMwcEvaluator = (
  candidate: MemoryWriteCandidate,
  projectId?: ProjectId,
) => Promise<{ approved: boolean; reason?: string }>;

/**
 * Creates an evaluator that delegates to the PFC's evaluateMemoryWrite.
 */
export function createPfcEvaluator(pfc: IPfcEngine): PfcMwcEvaluator {
  return async (
    candidate: MemoryWriteCandidate,
    projectId?: ProjectId,
  ): Promise<{ approved: boolean; reason?: string }> => {
    const decision = await pfc.evaluateMemoryWrite(candidate, projectId);
    return {
      approved: decision.approved,
      reason: decision.reason,
    };
  };
}
