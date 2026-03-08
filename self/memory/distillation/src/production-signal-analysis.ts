import type { ExperienceCluster, ExperienceRecord } from '@nous/shared';
import {
  type ProductionContradictionStatus,
  type ProductionSignalAnalysis,
  type ProductionSignalConfig,
  type ProductionStalenessStatus,
  DEFAULT_PRODUCTION_SIGNAL_CONFIG,
  ProductionSignalAnalysisSchema,
  ProductionSignalConfigSchema,
} from './production-contracts.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function toSentimentClass(
  sentiment: ExperienceRecord['sentiment'],
): 'positive' | 'negative' | 'neutral' {
  if (sentiment === 'strong-positive' || sentiment === 'weak-positive') {
    return 'positive';
  }

  if (sentiment === 'strong-negative' || sentiment === 'weak-negative') {
    return 'negative';
  }

  return 'neutral';
}

export function sortExperienceRecords(
  records: ExperienceRecord[],
): ExperienceRecord[] {
  return [...records].sort((a, b) => a.id.localeCompare(b.id));
}

function getLatestSupportingAt(records: ExperienceRecord[]): string {
  return [...records]
    .map((record) => record.updatedAt)
    .sort((left, right) => right.localeCompare(left))[0]!;
}

function getLatestAgeDays(latestSupportingAt: string, referenceAt: string): number {
  const diffMs = Date.parse(referenceAt) - Date.parse(latestSupportingAt);
  return Math.max(0, Math.floor(diffMs / DAY_MS));
}

export function determineContradictionStatus(
  positiveCount: number,
  negativeCount: number,
  signalConfig: ProductionSignalConfig = DEFAULT_PRODUCTION_SIGNAL_CONFIG,
): ProductionContradictionStatus {
  if (positiveCount === 0 || negativeCount === 0) {
    return 'none';
  }

  const total = positiveCount + negativeCount;
  const dominantRatio = Math.max(positiveCount, negativeCount) / total;
  if (dominantRatio < signalConfig.contradictionDominanceThreshold) {
    return 'blocking';
  }

  return 'detected';
}

export function determineStalenessStatus(
  latestAgeDays: number,
  signalConfig: ProductionSignalConfig = DEFAULT_PRODUCTION_SIGNAL_CONFIG,
): ProductionStalenessStatus {
  if (latestAgeDays >= signalConfig.staleDays) {
    return 'stale';
  }

  if (latestAgeDays >= signalConfig.agingDays) {
    return 'aging';
  }

  return 'fresh';
}

function buildEvidenceRefs(
  traceCount: number,
  signalConfig: ProductionSignalConfig,
) {
  return Array.from({
    length: Math.max(1, Math.min(traceCount, signalConfig.evidenceRefLimit)),
  }).map(() => ({
    actionCategory: 'memory-write' as const,
  }));
}

export function analyzeSourceRecords(
  records: ExperienceRecord[],
  input: {
    referenceAt: string;
    signalConfig?: ProductionSignalConfig;
  },
): ProductionSignalAnalysis {
  const signalConfig = ProductionSignalConfigSchema.parse(
    input.signalConfig ?? DEFAULT_PRODUCTION_SIGNAL_CONFIG,
  );
  const sortedRecords = sortExperienceRecords(records);
  const positiveCount = sortedRecords.filter(
    (record) => toSentimentClass(record.sentiment) === 'positive',
  ).length;
  const negativeCount = sortedRecords.filter(
    (record) => toSentimentClass(record.sentiment) === 'negative',
  ).length;
  const neutralCount = sortedRecords.length - positiveCount - negativeCount;
  const latestSupportingAt = getLatestSupportingAt(sortedRecords);
  const latestAgeDays = getLatestAgeDays(latestSupportingAt, input.referenceAt);
  const sourceTraceIds = [...new Set(sortedRecords.map((record) => record.provenance.traceId))]
    .sort((left, right) => left.localeCompare(right));

  return ProductionSignalAnalysisSchema.parse({
    basedOn: sortedRecords.map((record) => record.id),
    sourceTraceIds,
    supportingSignalCount: sortedRecords.length,
    positiveCount,
    negativeCount,
    neutralCount,
    contradictionStatus: determineContradictionStatus(
      positiveCount,
      negativeCount,
      signalConfig,
    ),
    stalenessStatus: determineStalenessStatus(latestAgeDays, signalConfig),
    latestSupportingAt,
    latestAgeDays,
    evidenceRefs: buildEvidenceRefs(sourceTraceIds.length, signalConfig),
  });
}

export function analyzeClusterSignals(
  cluster: ExperienceCluster,
  input: {
    referenceAt: string;
    signalConfig?: ProductionSignalConfig;
  },
): ProductionSignalAnalysis {
  return analyzeSourceRecords(cluster.records, input);
}

export function dominantSignalLabel(
  analysis: Pick<
    ProductionSignalAnalysis,
    'positiveCount' | 'negativeCount' | 'neutralCount'
  >,
): 'positive' | 'negative' | 'neutral' {
  if (
    analysis.positiveCount >= analysis.negativeCount &&
    analysis.positiveCount >= analysis.neutralCount
  ) {
    return 'positive';
  }

  if (
    analysis.negativeCount >= analysis.positiveCount &&
    analysis.negativeCount >= analysis.neutralCount
  ) {
    return 'negative';
  }

  return 'neutral';
}
