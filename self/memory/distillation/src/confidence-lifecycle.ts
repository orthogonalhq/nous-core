import type { ILtmStore, DistilledPattern } from '@nous/shared';
import {
  DistilledPatternSchema,
  ExperienceRecordSchema,
  type ConfidenceRefreshInput,
  type ConfidenceDecayInput,
  type ConfidenceUpdateResult,
  type ConfidenceLifecycle,
} from '@nous/shared';
import { DEFAULT_CONFIDENCE_LIFECYCLE } from '@nous/shared';
import {
  type DistillationObserver,
  type ProductionSignalConfig,
  DEFAULT_PRODUCTION_SIGNAL_CONFIG,
  deriveConfidenceTier,
  deriveDecayState,
  emitObserverLog,
  emitObserverMetric,
  roundConfidence,
} from './production-contracts.js';
import {
  analyzeSourceRecords,
  determineStalenessStatus,
} from './production-signal-analysis.js';

export interface ConfidenceLifecycleOptions {
  now?: () => string;
  observer?: DistillationObserver;
  signalConfig?: ProductionSignalConfig;
}

function nowIso(): string {
  return new Date().toISOString();
}

async function readSupportingRecords(
  ltm: ILtmStore,
  pattern: DistilledPattern,
) {
  const supportingRecords = [];

  for (const id of pattern.basedOn) {
    const entry = await ltm.read(id);
    if (entry?.type === 'experience-record') {
      supportingRecords.push(ExperienceRecordSchema.parse(entry));
    }
  }

  if (supportingRecords.length === 0) {
    throw new Error(`Pattern has no readable source records: ${pattern.id}`);
  }

  return supportingRecords;
}

export async function updateConfidence(
  ltm: ILtmStore,
  input: ConfidenceRefreshInput | ConfidenceDecayInput,
  config: ConfidenceLifecycle = DEFAULT_CONFIDENCE_LIFECYCLE,
  options: ConfidenceLifecycleOptions = {},
): Promise<ConfidenceUpdateResult> {
  const currentNow = options.now ?? nowIso;
  const pattern = await ltm.read(input.patternId);
  if (!pattern || pattern.type !== 'distilled-pattern') {
    throw new Error(`Pattern not found: ${input.patternId}`);
  }
  const parsed = DistilledPatternSchema.parse(pattern);
  const sourceRecords = await readSupportingRecords(ltm, parsed);
  const analysis = analyzeSourceRecords(sourceRecords, {
    referenceAt: currentNow(),
    signalConfig: options.signalConfig ?? DEFAULT_PRODUCTION_SIGNAL_CONFIG,
  });

  let newConfidence = parsed.confidence;
  let contradictionStatus = analysis.contradictionStatus;
  let stalenessStatus = analysis.stalenessStatus;
  let reason: 'refresh' | 'staleness' | 'contradiction';

  if ('alignmentScore' in input) {
    newConfidence =
      parsed.confidence + config.refreshIncrement * input.alignmentScore;
    reason = 'refresh';
  } else if (input.reason === 'staleness') {
    const days = input.stalenessDays ?? 0;
    newConfidence =
      parsed.confidence - config.stalenessDecayPerDay * Math.max(0, days);
    stalenessStatus = determineStalenessStatus(
      Math.max(analysis.latestAgeDays, days),
      options.signalConfig ?? DEFAULT_PRODUCTION_SIGNAL_CONFIG,
    );
    reason = 'staleness';
  } else {
    newConfidence = parsed.confidence - config.contradictionDecay;
    contradictionStatus = 'detected';
    reason = 'contradiction';
  }

  newConfidence = roundConfidence(newConfidence);
  const flaggedForRetirement =
    newConfidence < config.contradictionRetirementThreshold;
  const tier = deriveConfidenceTier(
    newConfidence,
    analysis.supportingSignalCount,
    config,
  );
  const decayState = deriveDecayState({
    flaggedForRetirement,
    contradictionStatus,
    stalenessStatus,
  });

  const updated = DistilledPatternSchema.parse({
    ...parsed,
    confidence: newConfidence,
    updatedAt: currentNow(),
  });
  await ltm.write(updated);

  await emitObserverMetric(options.observer, {
    name: 'distillation_confidence_update_total',
    value: 1,
    labels: { reason, tier, decayState },
  });
  if (flaggedForRetirement) {
    await emitObserverMetric(options.observer, {
      name: 'distillation_retirement_flag_total',
      value: 1,
      labels: { reason },
    });
  }
  await emitObserverLog(options.observer, {
    event: 'distillation.lifecycle.update',
    fields: {
      patternId: parsed.id,
      reason,
      previousConfidence: parsed.confidence,
      newConfidence,
      tier,
      decayState,
      flaggedForRetirement,
      traceId: parsed.provenance.traceId,
    },
  });

  return { newConfidence, flaggedForRetirement };
}
