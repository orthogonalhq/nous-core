import { describe, expect, it } from 'vitest';
import {
  createBaselineCurrentEngineCandidate,
  createDefaultPrototypeCandidates,
  createStructuredSummaryCandidate,
} from '../prototype-candidates.js';
import {
  evaluatePrototypeScenario,
  evaluatePrototypeSuite,
  summarizePrototypeCandidate,
} from '../prototype-evaluation.js';
import {
  BLOCKING_CONTRADICTION_SCENARIO,
  MIXED_SIGNAL_SCENARIO,
  PROTOTYPE_SCENARIOS,
  STABLE_PROMOTION_SCENARIO,
  STALE_HOLD_SCENARIO,
} from './fixtures/prototype-scenarios.js';

describe('prototype evaluation', () => {
  it('produces deterministic structured-summary results across repeated runs', async () => {
    const candidate = createStructuredSummaryCandidate();

    const runA = await evaluatePrototypeSuite([candidate], PROTOTYPE_SCENARIOS);
    const runB = await evaluatePrototypeSuite([candidate], PROTOTYPE_SCENARIOS);

    expect(runA).toEqual(runB);
  });

  it('recommends structured-summary-v1 over the baseline heuristic candidate', async () => {
    const suite = await evaluatePrototypeSuite(
      createDefaultPrototypeCandidates(),
      PROTOTYPE_SCENARIOS,
    );

    const baselineSummary = suite.summaries.find(
      (summary) => summary.candidateId === 'baseline-current-engine',
    );
    const structuredSummary = suite.summaries.find(
      (summary) => summary.candidateId === 'structured-summary-v1',
    );

    expect(baselineSummary?.overallDecision).toBe('no-go');
    expect(structuredSummary?.overallDecision).toBe('go');
    expect(suite.recommendation.decision).toBe('go');
    expect(suite.recommendation.recommendedCandidateId).toBe(
      'structured-summary-v1',
    );
  });

  it('flags baseline explainability failures on contradiction and staleness scenarios', async () => {
    const candidate = createBaselineCurrentEngineCandidate();

    const contradictionResult = await evaluatePrototypeScenario(
      candidate,
      BLOCKING_CONTRADICTION_SCENARIO,
    );
    const staleResult = await evaluatePrototypeScenario(
      candidate,
      STALE_HOLD_SCENARIO,
    );

    expect(contradictionResult.verdict.correctness).toBe('pass');
    expect(contradictionResult.verdict.traceability).toBe('pass');
    expect(contradictionResult.verdict.explainability).toBe('fail');
    expect(staleResult.verdict.correctness).toBe('pass');
    expect(staleResult.verdict.traceability).toBe('pass');
    expect(staleResult.verdict.explainability).toBe('fail');
  });

  it('allows the structured candidate to pass every scenario with complete traceability', async () => {
    const summary = await summarizePrototypeCandidate(
      createStructuredSummaryCandidate(),
      PROTOTYPE_SCENARIOS,
    );

    expect(summary.overallDecision).toBe('go');
    expect(summary.passCount).toBe(PROTOTYPE_SCENARIOS.length);
    expect(summary.failCount).toBe(0);
    for (const result of summary.scenarioResults) {
      expect(result.verdict.traceability).toBe('pass');
      expect(result.overallDecision).toBe('go');
    }
  });

  it('keeps stable promotion, mixed-signal hold, contradiction reject, and stale hold outcomes explicit', async () => {
    const candidate = createStructuredSummaryCandidate();

    const stable = await evaluatePrototypeScenario(
      candidate,
      STABLE_PROMOTION_SCENARIO,
    );
    const mixed = await evaluatePrototypeScenario(
      candidate,
      MIXED_SIGNAL_SCENARIO,
    );
    const contradiction = await evaluatePrototypeScenario(
      candidate,
      BLOCKING_CONTRADICTION_SCENARIO,
    );
    const stale = await evaluatePrototypeScenario(candidate, STALE_HOLD_SCENARIO);

    expect(stable.verdict.correctness).toBe('pass');
    expect(mixed.verdict.correctness).toBe('pass');
    expect(contradiction.verdict.correctness).toBe('pass');
    expect(stale.verdict.correctness).toBe('pass');
  });
});
