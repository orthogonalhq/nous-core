import type { DistilledPattern, ConfidenceLifecycle } from '@nous/shared';
import { DEFAULT_CONFIDENCE_LIFECYCLE } from '@nous/shared';
import {
  type ProductionPromotionGuardDecision,
  type ProductionSignalAnalysis,
  type ProductionPromotionValidationError,
  deriveConfidenceTier,
  deriveDecayState,
  ProductionPromotionGuardDecisionSchema,
} from './production-contracts.js';

function collectValidationErrors(
  pattern: DistilledPattern,
  analysis: ProductionSignalAnalysis,
): ProductionPromotionValidationError[] {
  const errors: ProductionPromotionValidationError[] = [];

  if (!pattern.basedOn.length) {
    errors.push('missing-based-on');
  }
  if (!analysis.sourceTraceIds.length) {
    errors.push('missing-source-trace-ids');
  }
  if (!pattern.evidenceRefs.length) {
    errors.push('missing-evidence-refs');
  }
  if (pattern.confidence == null) {
    errors.push('missing-confidence');
  } else if (!Number.isFinite(pattern.confidence)) {
    errors.push('invalid-confidence');
  }

  return errors;
}

export function evaluateProductionPromotion(
  pattern: DistilledPattern,
  analysis: ProductionSignalAnalysis,
  config: ConfidenceLifecycle = DEFAULT_CONFIDENCE_LIFECYCLE,
): ProductionPromotionGuardDecision {
  const validationErrors = collectValidationErrors(pattern, analysis);
  const flaggedForRetirement =
    pattern.confidence < config.contradictionRetirementThreshold;
  const tier = deriveConfidenceTier(
    pattern.confidence,
    analysis.supportingSignalCount,
    config,
  );
  const reasonCodes = new Set<
    'CONF-LOW' | 'CONF-CONTRADICTION' | 'CONF-STALENESS' | 'CONF-RETIREMENT'
  >();

  if (
    tier === 'low' ||
    analysis.supportingSignalCount < config.mediumConfidenceMinSignals
  ) {
    reasonCodes.add('CONF-LOW');
  }
  if (analysis.contradictionStatus !== 'none') {
    reasonCodes.add('CONF-CONTRADICTION');
  }
  if (analysis.stalenessStatus !== 'fresh') {
    reasonCodes.add('CONF-STALENESS');
  }
  if (flaggedForRetirement) {
    reasonCodes.add('CONF-RETIREMENT');
  }

  let decision: 'promote' | 'hold' | 'reject';
  if (validationErrors.length > 0 || analysis.contradictionStatus === 'blocking') {
    decision = 'reject';
  } else if (
    flaggedForRetirement ||
    analysis.contradictionStatus === 'detected' ||
    analysis.stalenessStatus !== 'fresh' ||
    tier === 'low' ||
    analysis.supportingSignalCount < config.mediumConfidenceMinSignals
  ) {
    decision = 'hold';
  } else {
    decision = 'promote';
  }

  const resolvedReasonCodes =
    reasonCodes.size > 0 ? [...reasonCodes] : (['CONF-LOW'] as const);

  return ProductionPromotionGuardDecisionSchema.parse({
    decision,
    confidence: pattern.confidence,
    tier,
    supersessionEligible: decision === 'promote',
    decayState: deriveDecayState({
      flaggedForRetirement,
      contradictionStatus: analysis.contradictionStatus,
      stalenessStatus: analysis.stalenessStatus,
    }),
    reasonCodes: resolvedReasonCodes,
    validationErrors,
  });
}
