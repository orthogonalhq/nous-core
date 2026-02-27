/**
 * Confidence refresh and decay for distilled patterns.
 * Phase 4.3: Deterministic formulas.
 */
import type { ILtmStore, DistilledPattern } from '@nous/shared';
import {
  DistilledPatternSchema,
  type ConfidenceRefreshInput,
  type ConfidenceDecayInput,
  type ConfidenceUpdateResult,
  type ConfidenceLifecycle,
} from '@nous/shared';
import { DEFAULT_CONFIDENCE_LIFECYCLE } from '@nous/shared';

export async function updateConfidence(
  ltm: ILtmStore,
  input: ConfidenceRefreshInput | ConfidenceDecayInput,
  config: ConfidenceLifecycle = DEFAULT_CONFIDENCE_LIFECYCLE,
): Promise<ConfidenceUpdateResult> {
  const pattern = await ltm.read(input.patternId);
  if (!pattern || pattern.type !== 'distilled-pattern') {
    throw new Error(`Pattern not found: ${input.patternId}`);
  }
  const parsed = DistilledPatternSchema.parse(pattern);

  let newConfidence: number;

  if ('alignmentScore' in input) {
    newConfidence = Math.min(
      1,
      parsed.confidence + config.refreshIncrement * input.alignmentScore,
    );
  } else {
    if (input.reason === 'staleness') {
      const days = input.stalenessDays ?? 0;
      newConfidence = Math.max(
        0,
        parsed.confidence - config.stalenessDecayPerDay * days,
      );
    } else {
      newConfidence = Math.max(
        0,
        parsed.confidence - config.contradictionDecay,
      );
    }
  }

  newConfidence = Math.round(newConfidence * 100) / 100;
  const flaggedForRetirement = newConfidence < config.contradictionRetirementThreshold;

  const updated = DistilledPatternSchema.parse({
    ...parsed,
    confidence: newConfidence,
    updatedAt: new Date().toISOString(),
  });
  await ltm.write(updated);

  return { newConfidence, flaggedForRetirement };
}
