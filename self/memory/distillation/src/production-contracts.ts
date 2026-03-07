import { z } from 'zod';
import {
  ConfidenceTierSchema,
  DEFAULT_CONFIDENCE_LIFECYCLE,
  EscalationSignalReasonCodeSchema,
  MemoryEntryIdSchema,
  ProjectIdSchema,
  TraceEvidenceReferenceSchema,
  TraceIdSchema,
  type ConfidenceLifecycle,
  type ConfidenceTier,
  type MemoryMutationAuditRecord,
} from '@nous/shared';

export const ProductionPromotionDecisionSchema = z.enum([
  'promote',
  'hold',
  'reject',
]);
export type ProductionPromotionDecision = z.infer<
  typeof ProductionPromotionDecisionSchema
>;

export const ProductionContradictionStatusSchema = z.enum([
  'none',
  'detected',
  'blocking',
]);
export type ProductionContradictionStatus = z.infer<
  typeof ProductionContradictionStatusSchema
>;

export const ProductionStalenessStatusSchema = z.enum([
  'fresh',
  'aging',
  'stale',
]);
export type ProductionStalenessStatus = z.infer<
  typeof ProductionStalenessStatusSchema
>;

export const ProductionDecayStateSchema = z.enum([
  'stable',
  'decaying',
  'flagged_retirement',
]);
export type ProductionDecayState = z.infer<typeof ProductionDecayStateSchema>;

export const ProductionSignalConfigSchema = z
  .object({
    agingDays: z.number().int().min(1),
    staleDays: z.number().int().min(2),
    contradictionDominanceThreshold: z.number().min(0.5).max(1),
    evidenceRefLimit: z.number().int().min(1).max(10),
  })
  .superRefine((value, ctx) => {
    if (value.staleDays <= value.agingDays) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'staleDays must be greater than agingDays',
        path: ['staleDays'],
      });
    }
  });
export type ProductionSignalConfig = z.infer<
  typeof ProductionSignalConfigSchema
>;

export const DEFAULT_PRODUCTION_SIGNAL_CONFIG: ProductionSignalConfig = {
  agingDays: 7,
  staleDays: 30,
  contradictionDominanceThreshold: 0.6,
  evidenceRefLimit: 3,
};

export const ProductionSignalAnalysisSchema = z.object({
  basedOn: z.array(MemoryEntryIdSchema).min(1),
  sourceTraceIds: z.array(TraceIdSchema).min(1),
  supportingSignalCount: z.number().int().min(1),
  positiveCount: z.number().int().min(0),
  negativeCount: z.number().int().min(0),
  neutralCount: z.number().int().min(0),
  contradictionStatus: ProductionContradictionStatusSchema,
  stalenessStatus: ProductionStalenessStatusSchema,
  latestSupportingAt: z.string().datetime(),
  latestAgeDays: z.number().int().min(0),
  evidenceRefs: z.array(TraceEvidenceReferenceSchema).min(1),
});
export type ProductionSignalAnalysis = z.infer<
  typeof ProductionSignalAnalysisSchema
>;

export const ProductionPromotionValidationErrorSchema = z.enum([
  'missing-based-on',
  'missing-source-trace-ids',
  'missing-evidence-refs',
  'missing-confidence',
  'invalid-confidence',
]);
export type ProductionPromotionValidationError = z.infer<
  typeof ProductionPromotionValidationErrorSchema
>;

export const ProductionPromotionGuardDecisionSchema = z.object({
  decision: ProductionPromotionDecisionSchema,
  confidence: z.number().min(0).max(1),
  tier: ConfidenceTierSchema,
  supersessionEligible: z.boolean(),
  decayState: ProductionDecayStateSchema,
  reasonCodes: z.array(EscalationSignalReasonCodeSchema).min(1),
  validationErrors: z
    .array(ProductionPromotionValidationErrorSchema)
    .default([]),
});
export type ProductionPromotionGuardDecision = z.infer<
  typeof ProductionPromotionGuardDecisionSchema
>;

export const PatternLifecycleSnapshotSchema = z.object({
  patternId: MemoryEntryIdSchema,
  projectId: ProjectIdSchema.optional(),
  confidence: z.number().min(0).max(1),
  tier: ConfidenceTierSchema,
  supportingSignals: z.number().int().min(0),
  contradictionStatus: ProductionContradictionStatusSchema,
  stalenessStatus: ProductionStalenessStatusSchema,
  decayState: ProductionDecayStateSchema,
  flaggedForRetirement: z.boolean(),
  updatedAt: z.string().datetime(),
  evidenceRefs: z.array(TraceEvidenceReferenceSchema).min(1),
});
export type PatternLifecycleSnapshot = z.infer<
  typeof PatternLifecycleSnapshotSchema
>;

export interface ProductionDistillationAuditSink {
  appendAuditRecord(
    input: Omit<MemoryMutationAuditRecord, 'sequence'> & { sequence?: number },
  ): Promise<void>;
}

export const DistillationMetricNameSchema = z.enum([
  'distillation_production_decision_total',
  'distillation_pattern_persist_total',
  'distillation_supersession_total',
  'distillation_compensation_rollback_total',
  'distillation_confidence_update_total',
  'distillation_retirement_flag_total',
  'distillation_reversal_total',
  'distillation_export_total',
  'distillation_source_trace_coverage_ratio',
]);
export type DistillationMetricName = z.infer<
  typeof DistillationMetricNameSchema
>;

export const DistillationStructuredLogEventSchema = z.enum([
  'distillation.production.decision',
  'distillation.lifecycle.update',
  'distillation.export',
  'distillation.reversal',
]);
export type DistillationStructuredLogEvent = z.infer<
  typeof DistillationStructuredLogEventSchema
>;

export interface DistillationObserverMetric {
  name: DistillationMetricName;
  value: number;
  labels?: Record<string, string | number | boolean>;
}

export interface DistillationObserverLog {
  event: DistillationStructuredLogEvent;
  fields: Record<string, unknown>;
}

export interface DistillationObserver {
  metric(input: DistillationObserverMetric): void | Promise<void>;
  log(input: DistillationObserverLog): void | Promise<void>;
}

export function roundConfidence(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
}

export function deriveConfidenceTier(
  confidence: number,
  supportingSignals: number,
  config: ConfidenceLifecycle = DEFAULT_CONFIDENCE_LIFECYCLE,
): ConfidenceTier {
  if (
    confidence >= config.highConfidenceThreshold &&
    supportingSignals >= config.highConfidenceMinSignals
  ) {
    return 'high';
  }

  if (
    confidence >= 0.6 &&
    supportingSignals >= config.mediumConfidenceMinSignals
  ) {
    return 'medium';
  }

  return 'low';
}

export function deriveDecayState(input: {
  flaggedForRetirement: boolean;
  contradictionStatus: ProductionContradictionStatus;
  stalenessStatus: ProductionStalenessStatus;
}): ProductionDecayState {
  if (input.flaggedForRetirement) {
    return 'flagged_retirement';
  }

  if (
    input.contradictionStatus !== 'none' ||
    input.stalenessStatus !== 'fresh'
  ) {
    return 'decaying';
  }

  return 'stable';
}

export function computeSourceTraceCoverageRatio(
  analysis: Pick<ProductionSignalAnalysis, 'sourceTraceIds' | 'basedOn'>,
): number {
  if (analysis.basedOn.length === 0) {
    return 0;
  }

  return Number(
    (analysis.sourceTraceIds.length / analysis.basedOn.length).toFixed(2),
  );
}

export async function emitObserverMetric(
  observer: DistillationObserver | undefined,
  input: DistillationObserverMetric,
): Promise<void> {
  if (!observer) {
    return;
  }

  await observer.metric(input);
}

export async function emitObserverLog(
  observer: DistillationObserver | undefined,
  input: DistillationObserverLog,
): Promise<void> {
  if (!observer) {
    return;
  }

  await observer.log(input);
}
