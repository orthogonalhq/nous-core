import type { DistilledPattern, ExperienceCluster, ExperienceRecord } from '@nous/shared';
import {
  DistilledPatternSchema,
  ExperienceClusterSchema,
  ExperienceRecordSchema,
} from '@nous/shared';
import type {
  DistillationObserver,
  DistillationObserverLog,
  DistillationObserverMetric,
} from '../../production-contracts.js';

export const NOW = '2026-03-07T00:00:00.000Z';
export const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000';

function toUuid(prefix: string, index: number): string {
  return `${prefix}${index.toString().padStart(12, '0')}`;
}

export function makeExperienceRecord(
  index: number,
  overrides: Partial<ExperienceRecord> = {},
): ExperienceRecord {
  const updatedAt = overrides.updatedAt ?? NOW;

  return ExperienceRecordSchema.parse({
    id: overrides.id ?? toUuid('550e8400-e29b-41d4-a716-', index),
    content: overrides.content ?? `context-${index}`,
    type: 'experience-record',
    scope: 'project',
    projectId: overrides.projectId ?? PROJECT_ID,
    confidence: overrides.confidence ?? 0.8,
    sensitivity: overrides.sensitivity ?? [],
    retention: overrides.retention ?? 'permanent',
    provenance: overrides.provenance ?? {
      traceId: toUuid('660e8400-e29b-41d4-a716-', index),
      source: 'test',
      timestamp: updatedAt,
    },
    tags: overrides.tags ?? ['distillation', 'phase-8.5'],
    sentiment: overrides.sentiment ?? 'strong-positive',
    context: overrides.context ?? `context-${index}`,
    action: overrides.action ?? 'act',
    outcome: overrides.outcome ?? 'outcome',
    reason: overrides.reason ?? `reason-${index}`,
    createdAt: overrides.createdAt ?? updatedAt,
    updatedAt,
    lifecycleStatus: overrides.lifecycleStatus ?? 'active',
  });
}

export function makeCluster(
  records: ExperienceRecord[],
  clusterKey = 'project:0',
): ExperienceCluster {
  return ExperienceClusterSchema.parse({
    records,
    clusterKey,
    projectId: records[0]?.projectId,
  });
}

export function makeStablePromotionCluster(count = 10): ExperienceCluster {
  const records = Array.from({ length: count }, (_, index) =>
    makeExperienceRecord(index + 1),
  );
  return makeCluster(records, 'stable-promotion');
}

export function makeLowSupportCluster(count = 4): ExperienceCluster {
  const records = Array.from({ length: count }, (_, index) =>
    makeExperienceRecord(index + 101),
  );
  return makeCluster(records, 'low-support');
}

export function makeMixedSignalCluster(): ExperienceCluster {
  const records = [
    makeExperienceRecord(201, { sentiment: 'strong-positive' }),
    makeExperienceRecord(202, { sentiment: 'strong-positive' }),
    makeExperienceRecord(203, { sentiment: 'strong-positive' }),
    makeExperienceRecord(204, { sentiment: 'strong-positive' }),
    makeExperienceRecord(205, { sentiment: 'strong-negative' }),
    makeExperienceRecord(206, { sentiment: 'strong-negative' }),
  ];
  return makeCluster(records, 'mixed-signal');
}

export function makeBlockingContradictionCluster(): ExperienceCluster {
  const records = [
    makeExperienceRecord(301, { sentiment: 'strong-positive' }),
    makeExperienceRecord(302, { sentiment: 'strong-positive' }),
    makeExperienceRecord(303, { sentiment: 'strong-positive' }),
    makeExperienceRecord(304, { sentiment: 'strong-negative' }),
    makeExperienceRecord(305, { sentiment: 'strong-negative' }),
    makeExperienceRecord(306, { sentiment: 'strong-negative' }),
  ];
  return makeCluster(records, 'blocking-contradiction');
}

export function makeAgingCluster(count = 10): ExperienceCluster {
  const records = Array.from({ length: count }, (_, index) =>
    makeExperienceRecord(index + 401, {
      updatedAt: '2026-02-25T00:00:00.000Z',
      createdAt: '2026-02-25T00:00:00.000Z',
    }),
  );
  return makeCluster(records, 'aging');
}

export function makeStaleCluster(count = 10): ExperienceCluster {
  const records = Array.from({ length: count }, (_, index) =>
    makeExperienceRecord(index + 501, {
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
    }),
  );
  return makeCluster(records, 'stale');
}

export function makePatternFromCluster(
  cluster: ExperienceCluster,
  overrides: Partial<DistilledPattern> = {},
): DistilledPattern {
  const basedOn = cluster.records.map((record) => record.id).sort();

  return DistilledPatternSchema.parse({
    id: overrides.id ?? toUuid('770e8400-e29b-41d4-a716-', 1),
    content: overrides.content ?? 'Signals: placeholder. Decision: promote.',
    type: 'distilled-pattern',
    scope: 'project',
    projectId: overrides.projectId ?? cluster.projectId,
    confidence: overrides.confidence ?? 0.67,
    sensitivity: overrides.sensitivity ?? [],
    retention: overrides.retention ?? 'permanent',
    provenance: overrides.provenance ?? {
      traceId: toUuid('880e8400-e29b-41d4-a716-', 1),
      source: 'distillation',
      timestamp: NOW,
    },
    tags: overrides.tags ?? ['distillation', 'phase-8.5'],
    createdAt: overrides.createdAt ?? NOW,
    updatedAt: overrides.updatedAt ?? NOW,
    basedOn: overrides.basedOn ?? basedOn,
    supersedes: overrides.supersedes ?? basedOn,
    evidenceRefs: overrides.evidenceRefs ?? [{ actionCategory: 'memory-write' }],
    lifecycleStatus: overrides.lifecycleStatus ?? 'active',
  });
}

export class CollectingObserver implements DistillationObserver {
  readonly metrics: DistillationObserverMetric[] = [];
  readonly logs: DistillationObserverLog[] = [];

  async metric(input: DistillationObserverMetric): Promise<void> {
    this.metrics.push(input);
  }

  async log(input: DistillationObserverLog): Promise<void> {
    this.logs.push(input);
  }
}
