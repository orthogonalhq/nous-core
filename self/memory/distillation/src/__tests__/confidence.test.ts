import { describe, expect, it } from 'vitest';
import { InMemoryLtmStore } from '@nous/memory-stubs';
import { DEFAULT_CONFIDENCE_LIFECYCLE } from '@nous/shared';
import { computeInitialConfidence } from '../confidence.js';
import { DistillationEngine } from '../distillation-engine.js';
import {
  CollectingObserver,
  NOW,
  makePatternFromCluster,
  makeStablePromotionCluster,
} from './fixtures/production-scenarios.js';

describe('computeInitialConfidence', () => {
  it('returns 0 when below minSupportingSignals', () => {
    const cluster = makeStablePromotionCluster(2);
    expect(computeInitialConfidence(cluster.records)).toBe(0);
  });

  it('is deterministic for equivalent input', () => {
    const cluster = makeStablePromotionCluster(10);

    const runA = computeInitialConfidence(cluster.records);
    const runB = computeInitialConfidence(cluster.records);

    expect(runA).toBe(runB);
    expect(runA).toBeGreaterThanOrEqual(0.6);
  });
});

describe('confidence lifecycle', () => {
  it('refresh raises confidence and emits lifecycle observability', async () => {
    const store = new InMemoryLtmStore();
    const cluster = makeStablePromotionCluster(10);
    for (const record of cluster.records) {
      await store.write(record);
    }
    const pattern = makePatternFromCluster(cluster, { confidence: 0.67 });
    await store.write(pattern);
    const observer = new CollectingObserver();
    const engine = new DistillationEngine(store, {
      now: () => NOW,
      observer,
    });

    const result = await engine.updateConfidence({
      patternId: pattern.id,
      confirmingRecordId: cluster.records[0]!.id,
      alignmentScore: 1,
    });

    expect(result.newConfidence).toBe(0.69);
    expect(result.flaggedForRetirement).toBe(false);
    const updated = await store.read(pattern.id);
    expect(updated?.confidence).toBe(0.69);
    expect(
      observer.metrics.some(
        (metric) =>
          metric.name === 'distillation_confidence_update_total' &&
          metric.labels?.reason === 'refresh',
      ),
    ).toBe(true);
    expect(
      observer.logs.some(
        (log) =>
          log.event === 'distillation.lifecycle.update' &&
          log.fields.patternId === pattern.id,
      ),
    ).toBe(true);
  });

  it('contradiction decay flags retirement below threshold', async () => {
    const store = new InMemoryLtmStore();
    const cluster = makeStablePromotionCluster(10);
    for (const record of cluster.records) {
      await store.write(record);
    }
    const pattern = makePatternFromCluster(cluster, { confidence: 0.45 });
    await store.write(pattern);
    const observer = new CollectingObserver();
    const engine = new DistillationEngine(store, {
      now: () => NOW,
      observer,
      confidenceConfig: {
        ...DEFAULT_CONFIDENCE_LIFECYCLE,
        contradictionDecay: 0.1,
        contradictionRetirementThreshold: 0.4,
      },
    });

    const result = await engine.updateConfidence({
      patternId: pattern.id,
      reason: 'contradiction',
      contradictingRecordId: cluster.records[0]!.id,
    });

    expect(result.newConfidence).toBe(0.35);
    expect(result.flaggedForRetirement).toBe(true);
    expect(
      observer.metrics.some(
        (metric) =>
          metric.name === 'distillation_retirement_flag_total' &&
          metric.labels?.reason === 'contradiction',
      ),
    ).toBe(true);
  });

  it('staleness decay uses supplied days deterministically', async () => {
    const store = new InMemoryLtmStore();
    const cluster = makeStablePromotionCluster(10);
    for (const record of cluster.records) {
      await store.write(record);
    }
    const pattern = makePatternFromCluster(cluster, { confidence: 0.67 });
    await store.write(pattern);
    const engine = new DistillationEngine(store, {
      now: () => NOW,
      confidenceConfig: {
        ...DEFAULT_CONFIDENCE_LIFECYCLE,
        stalenessDecayPerDay: 0.02,
      },
    });

    const result = await engine.updateConfidence({
      patternId: pattern.id,
      reason: 'staleness',
      stalenessDays: 5,
    });

    expect(result.newConfidence).toBe(0.57);
    expect(result.flaggedForRetirement).toBe(false);
  });
});
