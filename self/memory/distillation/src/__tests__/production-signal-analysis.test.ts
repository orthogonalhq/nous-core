import { describe, expect, it } from 'vitest';
import { computeInitialConfidence } from '../confidence.js';
import { evaluateProductionPromotion } from '../production-guards.js';
import {
  analyzeClusterSignals,
  analyzeSourceRecords,
} from '../production-signal-analysis.js';
import {
  NOW,
  makeAgingCluster,
  makeBlockingContradictionCluster,
  makeLowSupportCluster,
  makeMixedSignalCluster,
  makePatternFromCluster,
  makeStablePromotionCluster,
  makeStaleCluster,
} from './fixtures/production-scenarios.js';

describe('production signal analysis', () => {
  it('analyzes stable clusters deterministically', () => {
    const cluster = makeStablePromotionCluster(10);

    const runA = analyzeClusterSignals(cluster, { referenceAt: NOW });
    const runB = analyzeClusterSignals(cluster, { referenceAt: NOW });

    expect(runA).toEqual(runB);
    expect(runA.supportingSignalCount).toBe(10);
    expect(runA.contradictionStatus).toBe('none');
    expect(runA.stalenessStatus).toBe('fresh');
    expect(runA.sourceTraceIds).toHaveLength(10);
  });

  it('classifies mixed-signal, blocking contradiction, aging, and stale cases explicitly', () => {
    expect(
      analyzeClusterSignals(makeMixedSignalCluster(), { referenceAt: NOW })
        .contradictionStatus,
    ).toBe('detected');
    expect(
      analyzeClusterSignals(makeBlockingContradictionCluster(), {
        referenceAt: NOW,
      }).contradictionStatus,
    ).toBe('blocking');
    expect(
      analyzeClusterSignals(makeAgingCluster(), { referenceAt: NOW })
        .stalenessStatus,
    ).toBe('aging');
    expect(
      analyzeClusterSignals(makeStaleCluster(), { referenceAt: NOW })
        .stalenessStatus,
    ).toBe('stale');
  });
});

describe('production promotion guards', () => {
  it('promotes fresh, sufficiently supported clusters', () => {
    const cluster = makeStablePromotionCluster(10);
    const analysis = analyzeSourceRecords(cluster.records, { referenceAt: NOW });
    const pattern = makePatternFromCluster(cluster, {
      confidence: computeInitialConfidence(cluster.records),
    });

    const decision = evaluateProductionPromotion(pattern, analysis);

    expect(decision.decision).toBe('promote');
    expect(decision.supersessionEligible).toBe(true);
    expect(decision.tier).toBe('medium');
  });

  it('holds low-support or aging clusters without allowing supersession', () => {
    const lowSupport = makeLowSupportCluster();
    const lowSupportDecision = evaluateProductionPromotion(
      makePatternFromCluster(lowSupport, {
        confidence: computeInitialConfidence(lowSupport.records),
      }),
      analyzeSourceRecords(lowSupport.records, { referenceAt: NOW }),
    );
    const aging = makeAgingCluster();
    const agingDecision = evaluateProductionPromotion(
      makePatternFromCluster(aging, {
        confidence: computeInitialConfidence(aging.records),
      }),
      analyzeSourceRecords(aging.records, { referenceAt: NOW }),
    );

    expect(lowSupportDecision.decision).toBe('hold');
    expect(lowSupportDecision.supersessionEligible).toBe(false);
    expect(agingDecision.decision).toBe('hold');
    expect(agingDecision.reasonCodes).toContain('CONF-STALENESS');
  });

  it('rejects blocking contradiction and invalid promotion attempts', () => {
    const contradiction = makeBlockingContradictionCluster();
    const stable = makeStablePromotionCluster();
    const contradictionDecision = evaluateProductionPromotion(
      makePatternFromCluster(contradiction, {
        confidence: computeInitialConfidence(contradiction.records),
      }),
      analyzeSourceRecords(contradiction.records, { referenceAt: NOW }),
    );
    const invalidPattern = {
      ...makePatternFromCluster(stable),
      evidenceRefs: [],
    } as any;
    const invalidDecision = evaluateProductionPromotion(
      invalidPattern,
      analyzeSourceRecords(stable.records, {
        referenceAt: NOW,
      }),
    );

    expect(contradictionDecision.decision).toBe('reject');
    expect(contradictionDecision.reasonCodes).toContain('CONF-CONTRADICTION');
    expect(invalidDecision.decision).toBe('reject');
    expect(invalidDecision.validationErrors).toContain('missing-evidence-refs');
  });
});
