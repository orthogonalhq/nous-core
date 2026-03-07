import type {
  ConfidenceLifecycle,
  DistilledPattern,
  EscalationSignal,
  ExperienceRecord,
  LearnedBehaviorExplanation,
  Phase6ConfidenceSignalExport,
  Phase6DistilledPatternExport,
} from '@nous/shared';
import {
  DEFAULT_CONFIDENCE_LIFECYCLE,
  EscalationSignalSchema,
  LearnedBehaviorExplanationSchema,
  Phase6ConfidenceSignalExportSchema,
  Phase6DistilledPatternExportSchema,
} from '@nous/shared';
import {
  type DistillationObserver,
  type PatternLifecycleSnapshot,
  type ProductionPromotionGuardDecision,
  type ProductionSignalAnalysis,
  PatternLifecycleSnapshotSchema,
  deriveConfidenceTier,
  deriveDecayState,
  emitObserverLog,
  emitObserverMetric,
} from './production-contracts.js';
import { analyzeSourceRecords } from './production-signal-analysis.js';

function resolveEscalationReasonCode(
  decision: ProductionPromotionGuardDecision,
): 'CONF-LOW' | 'CONF-CONTRADICTION' | 'CONF-STALENESS' | 'CONF-RETIREMENT' {
  if (decision.reasonCodes.includes('CONF-RETIREMENT')) {
    return 'CONF-RETIREMENT';
  }
  if (decision.reasonCodes.includes('CONF-CONTRADICTION')) {
    return 'CONF-CONTRADICTION';
  }
  if (decision.reasonCodes.includes('CONF-STALENESS')) {
    return 'CONF-STALENESS';
  }
  return 'CONF-LOW';
}

export function createPatternLifecycleSnapshot(
  pattern: DistilledPattern,
  sourceRecords: ExperienceRecord[],
  input: {
    referenceAt: string;
    confidenceConfig?: ConfidenceLifecycle;
  },
): PatternLifecycleSnapshot {
  const confidenceConfig = input.confidenceConfig ?? DEFAULT_CONFIDENCE_LIFECYCLE;
  const analysis = analyzeSourceRecords(sourceRecords, {
    referenceAt: input.referenceAt,
  });
  const flaggedForRetirement =
    pattern.confidence < confidenceConfig.contradictionRetirementThreshold;

  return PatternLifecycleSnapshotSchema.parse({
    patternId: pattern.id,
    projectId: pattern.projectId,
    confidence: pattern.confidence,
    tier: deriveConfidenceTier(
      pattern.confidence,
      analysis.supportingSignalCount,
      confidenceConfig,
    ),
    supportingSignals: analysis.supportingSignalCount,
    contradictionStatus: analysis.contradictionStatus,
    stalenessStatus: analysis.stalenessStatus,
    decayState: deriveDecayState({
      flaggedForRetirement,
      contradictionStatus: analysis.contradictionStatus,
      stalenessStatus: analysis.stalenessStatus,
    }),
    flaggedForRetirement,
    updatedAt: pattern.updatedAt,
    evidenceRefs: pattern.evidenceRefs,
  });
}

export async function toPhase6DistilledPatternExport(
  pattern: DistilledPattern,
  observer?: DistillationObserver,
): Promise<Phase6DistilledPatternExport> {
  const exported = Phase6DistilledPatternExportSchema.parse({
    id: pattern.id,
    content: pattern.content,
    confidence: pattern.confidence,
    basedOn: pattern.basedOn,
    supersedes: pattern.supersedes,
    evidenceRefs: pattern.evidenceRefs,
    projectId: pattern.projectId,
    scope: pattern.scope,
    tags: pattern.tags,
    createdAt: pattern.createdAt,
    updatedAt: pattern.updatedAt,
  });

  await emitObserverMetric(observer, {
    name: 'distillation_export_total',
    value: 1,
    labels: { exportType: 'phase6_distilled_pattern' },
  });
  await emitObserverLog(observer, {
    event: 'distillation.export',
    fields: {
      exportType: 'phase6_distilled_pattern',
      patternId: pattern.id,
      confidence: pattern.confidence,
    },
  });

  return exported;
}

export async function toPhase6ConfidenceSignalExport(
  snapshot: PatternLifecycleSnapshot,
  observer?: DistillationObserver,
): Promise<Phase6ConfidenceSignalExport> {
  const exported = Phase6ConfidenceSignalExportSchema.parse({
    tier: snapshot.tier,
    confidence: snapshot.confidence,
    supportingSignals: snapshot.supportingSignals,
    patternId: snapshot.patternId,
    decayState: snapshot.decayState,
  });

  await emitObserverMetric(observer, {
    name: 'distillation_export_total',
    value: 1,
    labels: { exportType: 'phase6_confidence_signal' },
  });
  await emitObserverLog(observer, {
    event: 'distillation.export',
    fields: {
      exportType: 'phase6_confidence_signal',
      patternId: snapshot.patternId,
      tier: snapshot.tier,
      decayState: snapshot.decayState,
    },
  });

  return exported;
}

export async function toLearnedBehaviorExplanation(
  pattern: DistilledPattern,
  outcomeRef: string,
  observer?: DistillationObserver,
): Promise<LearnedBehaviorExplanation> {
  const exported = LearnedBehaviorExplanationSchema.parse({
    patternId: pattern.id,
    outcomeRef,
    evidenceRefs: pattern.evidenceRefs,
    distillationRef: pattern.provenance.traceId,
  });

  await emitObserverMetric(observer, {
    name: 'distillation_export_total',
    value: 1,
    labels: { exportType: 'learned_behavior_explanation' },
  });
  await emitObserverLog(observer, {
    event: 'distillation.export',
    fields: {
      exportType: 'learned_behavior_explanation',
      patternId: pattern.id,
      outcomeRef,
    },
  });

  return exported;
}

export async function toEscalationSignal(
  input: {
    analysis: ProductionSignalAnalysis;
    decision: ProductionPromotionGuardDecision;
    patternId?: string;
    detail?: Record<string, unknown>;
  },
  observer?: DistillationObserver,
): Promise<EscalationSignal> {
  const signal = EscalationSignalSchema.parse({
    reasonCode: resolveEscalationReasonCode(input.decision),
    traceId: input.analysis.sourceTraceIds[0],
    evidenceRefs: input.analysis.evidenceRefs,
    patternId: input.patternId,
    detail: {
      decision: input.decision.decision,
      tier: input.decision.tier,
      contradictionStatus: input.analysis.contradictionStatus,
      stalenessStatus: input.analysis.stalenessStatus,
      decayState: input.decision.decayState,
      ...input.detail,
    },
  });

  await emitObserverMetric(observer, {
    name: 'distillation_export_total',
    value: 1,
    labels: { exportType: 'escalation_signal' },
  });
  await emitObserverLog(observer, {
    event: 'distillation.export',
    fields: {
      exportType: 'escalation_signal',
      reasonCode: signal.reasonCode,
      patternId: signal.patternId,
    },
  });

  return signal;
}
