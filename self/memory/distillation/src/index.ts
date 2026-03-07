/**
 * @nous/memory-distillation - Distillation engine for Nous-OSS.
 *
 * Phase 8.5: structured-summary-v1 production path, guarded promotion,
 * confidence lifecycle, reversal, and export helpers.
 */
export { DistillationEngine } from './distillation-engine.js';
export type { DistillationEngineConfig } from './distillation-engine.js';
export { identifyClusters } from './clustering.js';
export { computeInitialConfidence } from './confidence.js';
export { updateConfidence } from './confidence-lifecycle.js';
export type { ConfidenceLifecycleOptions } from './confidence-lifecycle.js';
export { reverseSupersession } from './supersession-reversal.js';
export type { SupersessionReversalOptions } from './supersession-reversal.js';
export {
  analyzeClusterSignals,
  analyzeSourceRecords,
  dominantSignalLabel,
  sortExperienceRecords,
} from './production-signal-analysis.js';
export { evaluateProductionPromotion } from './production-guards.js';
export {
  createPatternLifecycleSnapshot,
  toEscalationSignal,
  toLearnedBehaviorExplanation,
  toPhase6ConfidenceSignalExport,
  toPhase6DistilledPatternExport,
} from './exports.js';
export { buildStructuredSummary } from './structured-summary.js';
export type { StructuredSummaryInput } from './structured-summary.js';
export {
  DEFAULT_PRODUCTION_SIGNAL_CONFIG,
  computeSourceTraceCoverageRatio,
  deriveConfidenceTier,
  deriveDecayState,
  roundConfidence,
} from './production-contracts.js';
export type {
  DistillationObserver,
  DistillationObserverLog,
  DistillationObserverMetric,
  DistillationMetricName,
  DistillationStructuredLogEvent,
  PatternLifecycleSnapshot,
  ProductionContradictionStatus,
  ProductionDecayState,
  ProductionDistillationAuditSink,
  ProductionPromotionDecision,
  ProductionPromotionGuardDecision,
  ProductionPromotionValidationError,
  ProductionSignalAnalysis,
  ProductionSignalConfig,
  ProductionStalenessStatus,
} from './production-contracts.js';
