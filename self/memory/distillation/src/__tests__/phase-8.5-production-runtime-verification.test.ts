import { describe, expect, it } from 'vitest';
import { InMemoryLtmStore } from '@nous/memory-stubs';
import type { MemoryEntryId } from '@nous/shared';
import { DistillationEngine } from '../distillation-engine.js';
import {
  CollectingObserver,
  NOW,
  PROJECT_ID,
  makeBlockingContradictionCluster,
  makeMixedSignalCluster,
  makeStablePromotionCluster,
} from './fixtures/production-scenarios.js';

class FailingSupersessionStore extends InMemoryLtmStore {
  override async markSuperseded(
    ids: MemoryEntryId[],
    supersededBy: MemoryEntryId,
  ): Promise<void> {
    await super.markSuperseded(ids, supersededBy);
    throw new Error(`forced markSuperseded failure for ${supersededBy}`);
  }
}

async function writeCluster(store: InMemoryLtmStore, cluster: { records: any[] }) {
  for (const record of cluster.records) {
    await store.write(record);
  }
}

describe('Phase 8.5 production runtime verification', () => {
  it('uses the structured-summary production path for promoted patterns', async () => {
    const store = new InMemoryLtmStore();
    const cluster = makeStablePromotionCluster();
    await writeCluster(store, cluster);

    const engine = new DistillationEngine(store, {
      now: () => NOW,
    });

    const result = await engine.runDistillationPass(PROJECT_ID);

    expect(result.patternsCreated).toHaveLength(1);
    expect(result.patternsCreated[0]?.content).toContain('Signals:');
    expect(result.patternsCreated[0]?.content).toContain('Decision: promote.');
    expect(result.patternsCreated[0]?.content).not.toContain('->');
  });

  it('does not mutate LTM lifecycle state for hold or reject decisions', async () => {
    const holdStore = new InMemoryLtmStore();
    const holdCluster = makeMixedSignalCluster();
    await writeCluster(holdStore, holdCluster);
    const holdEngine = new DistillationEngine(holdStore, {
      now: () => NOW,
    });

    const holdResult = await holdEngine.runDistillationPass(PROJECT_ID);
    expect(holdResult.patternsCreated).toHaveLength(0);
    for (const record of holdCluster.records) {
      expect((await holdStore.read(record.id))?.lifecycleStatus).toBe('active');
    }

    const rejectStore = new InMemoryLtmStore();
    const rejectCluster = makeBlockingContradictionCluster();
    await writeCluster(rejectStore, rejectCluster);
    const rejectEngine = new DistillationEngine(rejectStore, {
      now: () => NOW,
    });

    const rejectResult = await rejectEngine.runDistillationPass(PROJECT_ID);
    expect(rejectResult.patternsCreated).toHaveLength(0);
    for (const record of rejectCluster.records) {
      expect((await rejectStore.read(record.id))?.lifecycleStatus).toBe('active');
    }
  });

  it('compensates by deleting partially persisted patterns when supersession marking fails', async () => {
    const store = new FailingSupersessionStore();
    const cluster = makeStablePromotionCluster();
    await writeCluster(store, cluster);
    const observer = new CollectingObserver();
    const engine = new DistillationEngine(store, {
      now: () => NOW,
      observer,
      idFactory: (() => {
        let next = 1;
        return () => `993e8400-e29b-41d4-a716-${String(next++).padStart(12, '0')}`;
      })(),
    });

    await expect(engine.runDistillationPass(PROJECT_ID)).rejects.toThrow(
      /forced markSuperseded failure/,
    );

    const persistedPatterns = await store.query({ type: 'distilled-pattern' });
    expect(persistedPatterns).toHaveLength(0);
    for (const record of cluster.records) {
      expect((await store.read(record.id))?.lifecycleStatus).toBe('active');
      expect((await store.read(record.id))?.supersededBy).toBeUndefined();
    }
    expect(
      observer.metrics.some(
        (metric) =>
          metric.name === 'distillation_compensation_rollback_total' &&
          metric.labels?.reason === 'supersession-mark-failure',
      ),
    ).toBe(true);
  });
});
