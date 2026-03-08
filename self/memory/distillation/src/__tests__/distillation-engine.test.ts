import { describe, expect, it } from 'vitest';
import { InMemoryLtmStore } from '@nous/memory-stubs';
import type { ExperienceCluster } from '@nous/shared';
import { DistillationEngine } from '../distillation-engine.js';
import {
  CollectingObserver,
  NOW,
  PROJECT_ID,
  makeLowSupportCluster,
  makeStablePromotionCluster,
} from './fixtures/production-scenarios.js';

async function writeCluster(
  store: InMemoryLtmStore,
  cluster: ExperienceCluster,
) {
  for (const record of cluster.records) {
    await store.write(record);
  }
}

describe('DistillationEngine', () => {
  it('distill returns a structured-summary draft with full source coverage', async () => {
    const store = new InMemoryLtmStore();
    const cluster = makeStablePromotionCluster();
    await writeCluster(store, cluster);

    const engine = new DistillationEngine(store, {
      now: () => NOW,
      idFactory: (() => {
        let next = 1;
        return () => `990e8400-e29b-41d4-a716-${String(next++).padStart(12, '0')}`;
      })(),
    });

    const draft = await engine.distill(cluster);

    expect(draft.type).toBe('distilled-pattern');
    expect(draft.content).toContain('Signals:');
    expect(draft.content).toContain('Decision: promote.');
    expect(draft.basedOn).toHaveLength(cluster.records.length);
    expect(draft.supersedes).toEqual(draft.basedOn);
    expect(draft.evidenceRefs.length).toBeGreaterThan(0);

    const persistedPatterns = await store.query({ type: 'distilled-pattern' });
    expect(persistedPatterns).toHaveLength(0);
  });

  it('runDistillationPass persists only promote decisions and supersedes source records', async () => {
    const store = new InMemoryLtmStore();
    const cluster = makeStablePromotionCluster();
    await writeCluster(store, cluster);
    const observer = new CollectingObserver();
    const auditRecords: Array<{ resultingEntryId?: string; reasonCode: string }> =
      [];

    const engine = new DistillationEngine(store, {
      now: () => NOW,
      idFactory: (() => {
        let next = 1;
        return () => `991e8400-e29b-41d4-a716-${String(next++).padStart(12, '0')}`;
      })(),
      observer,
      auditSink: {
        async appendAuditRecord(input) {
          auditRecords.push({
            resultingEntryId: input.resultingEntryId,
            reasonCode: input.reasonCode,
          });
        },
      },
    });

    const result = await engine.runDistillationPass(PROJECT_ID);

    expect(result.clustersProcessed).toBe(1);
    expect(result.patternsCreated).toHaveLength(1);
    expect(result.recordsSuperseded).toHaveLength(cluster.records.length);
    expect(auditRecords).toHaveLength(1);
    expect(auditRecords[0]?.reasonCode).toBe('MEM-SUPERSEDE-APPLIED');

    const persistedPattern = result.patternsCreated[0]!;
    expect(persistedPattern.content).toContain('Decision: promote.');
    for (const record of cluster.records) {
      const updated = await store.read(record.id);
      expect(updated?.lifecycleStatus).toBe('superseded');
      expect(updated?.supersededBy).toBe(persistedPattern.id);
    }

    expect(
      observer.metrics.some(
        (metric) =>
          metric.name === 'distillation_production_decision_total' &&
          metric.labels?.decision === 'promote',
      ),
    ).toBe(true);
    expect(
      observer.logs.some(
        (log) =>
          log.event === 'distillation.production.decision' &&
          log.fields.projectId === PROJECT_ID &&
          log.fields.decision === 'promote',
      ),
    ).toBe(true);
  });

  it('runDistillationPass leaves hold decisions unpersisted', async () => {
    const store = new InMemoryLtmStore();
    const cluster = makeLowSupportCluster();
    await writeCluster(store, cluster);

    const engine = new DistillationEngine(store, {
      now: () => NOW,
    });

    const result = await engine.runDistillationPass(PROJECT_ID);

    expect(result.clustersProcessed).toBe(1);
    expect(result.patternsCreated).toHaveLength(0);
    expect(result.recordsSuperseded).toHaveLength(0);

    const persistedPatterns = await store.query({ type: 'distilled-pattern' });
    expect(persistedPatterns).toHaveLength(0);
    for (const record of cluster.records) {
      const updated = await store.read(record.id);
      expect(updated?.lifecycleStatus).not.toBe('superseded');
    }
  });
});
