/**
 * Initial confidence assignment for distilled patterns.
 * Phase 4.3: Deterministic formula from consistency and volume.
 */
import type { ExperienceRecord, ConfidenceLifecycle } from '@nous/shared';
import { DEFAULT_CONFIDENCE_LIFECYCLE } from '@nous/shared';

/**
 * Compute base consistency: fraction of records with aligned outcome class.
 * Outcome classes: positive (strong/weak positive), negative (strong/weak negative), neutral.
 */
function outcomeClass(sentiment: string): string {
  if (sentiment === 'strong-positive' || sentiment === 'weak-positive') return 'positive';
  if (sentiment === 'strong-negative' || sentiment === 'weak-negative') return 'negative';
  return 'neutral';
}

/**
 * Compute initial confidence for a distilled pattern from its source records.
 * Formula: baseConsistency * volumeFactor
 * Deterministic for equivalent input.
 */
export function computeInitialConfidence(
  records: ExperienceRecord[],
  config: ConfidenceLifecycle = DEFAULT_CONFIDENCE_LIFECYCLE,
): number {
  if (records.length < config.minSupportingSignals) return 0;

  const classes = records.map((r) => outcomeClass(r.sentiment));
  const counts = new Map<string, number>();
  for (const c of classes) {
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const maxCount = Math.max(...counts.values());
  const baseConsistency = maxCount / records.length;

  const volumeFactor = Math.min(
    1,
    records.length / config.highConfidenceMinSignals,
  );

  const raw = baseConsistency * volumeFactor;
  return Math.round(raw * 100) / 100;
}
