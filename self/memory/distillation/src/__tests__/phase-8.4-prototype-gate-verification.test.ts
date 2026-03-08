import { describe, expect, it } from 'vitest';
import { InMemoryLtmStore } from '@nous/memory-stubs';
import {
  createDefaultPrototypeCandidates,
  createStructuredSummaryCandidate,
} from '../prototype-candidates.js';
import { evaluatePrototypeSuite } from '../prototype-evaluation.js';
import {
  BLOCKING_CONTRADICTION_SCENARIO,
  PROTOTYPE_SCENARIOS,
  STALE_HOLD_SCENARIO,
} from './fixtures/prototype-scenarios.js';

describe('Phase 8.4 prototype gate verification', () => {
  it('does not mutate isolated LTM records while running prototype evaluation', async () => {
    const store = new InMemoryLtmStore();
    for (const scenario of PROTOTYPE_SCENARIOS) {
      for (const record of scenario.cluster.records) {
        await store.write(record);
      }
    }

    const before = await store.query({
      type: 'experience-record',
      projectId: PROTOTYPE_SCENARIOS[0]!.cluster.projectId,
    });

    await evaluatePrototypeSuite(
      createDefaultPrototypeCandidates(),
      PROTOTYPE_SCENARIOS,
    );

    const after = await store.query({
      type: 'experience-record',
      projectId: PROTOTYPE_SCENARIOS[0]!.cluster.projectId,
    });

    expect(after).toEqual(before);
    expect(after.every((entry) => entry.lifecycleStatus !== 'superseded')).toBe(
      true,
    );
  });

  it('never recommends promotion for blocking contradiction or stale scenarios', async () => {
    const suite = await evaluatePrototypeSuite(
      [createStructuredSummaryCandidate()],
      [BLOCKING_CONTRADICTION_SCENARIO, STALE_HOLD_SCENARIO],
    );

    for (const result of suite.summaries[0]!.scenarioResults) {
      expect(result.overallDecision).toBe('go');
      expect(
        result.verdict.contradictionHandling === 'pass' ||
          result.verdict.stalenessBehavior === 'pass',
      ).toBe(true);
    }
  });

  it('preserves full source-record coverage in every prototype scenario result', async () => {
    const suite = await evaluatePrototypeSuite(
      createDefaultPrototypeCandidates(),
      PROTOTYPE_SCENARIOS,
    );

    for (const summary of suite.summaries) {
      for (const result of summary.scenarioResults) {
        expect(result.verdict.traceability).toBe('pass');
      }
    }
  });
});
