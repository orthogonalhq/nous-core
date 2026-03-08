import type {
  ProductionContradictionStatus,
  ProductionPromotionDecision,
  ProductionStalenessStatus,
} from './production-contracts.js';
import { dominantSignalLabel } from './production-signal-analysis.js';

export interface StructuredSummaryInput {
  supportingSignalCount: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  latestAgeDays: number;
  contradictionStatus: ProductionContradictionStatus;
  stalenessStatus: ProductionStalenessStatus;
  decision: ProductionPromotionDecision;
}

export function buildStructuredSummary(input: StructuredSummaryInput): string {
  const dominantSignal = dominantSignalLabel(input);

  return [
    `Signals: ${input.supportingSignalCount} records with dominant ${dominantSignal} evidence.`,
    `Support: ${input.positiveCount} positive, ${input.neutralCount} neutral, ${input.negativeCount} negative.`,
    `Contradiction: ${input.contradictionStatus}.`,
    `Freshness: ${input.stalenessStatus}; latest evidence is ${input.latestAgeDays} day(s) old.`,
    `Decision: ${input.decision}.`,
  ].join(' ');
}
