import { describe, expect, it } from 'vitest';
import {
  EscalationSignalSchema,
  LearnedBehaviorExplanationSchema,
  Phase6ConfidenceSignalExportSchema,
  Phase6DistilledPatternExportSchema,
} from '@nous/shared';
import {
  createPatternLifecycleSnapshot,
  toEscalationSignal,
  toLearnedBehaviorExplanation,
  toPhase6ConfidenceSignalExport,
  toPhase6DistilledPatternExport,
} from '../exports.js';
import { analyzeSourceRecords } from '../production-signal-analysis.js';
import {
  CollectingObserver,
  NOW,
  makeAgingCluster,
  makePatternFromCluster,
  makeStablePromotionCluster,
} from './fixtures/production-scenarios.js';

describe('production export helpers', () => {
  it('maps promoted patterns to the shared Phase 6 distilled export shape', async () => {
    const cluster = makeStablePromotionCluster();
    const pattern = makePatternFromCluster(cluster);
    const observer = new CollectingObserver();

    const exported = await toPhase6DistilledPatternExport(pattern, observer);

    expect(Phase6DistilledPatternExportSchema.safeParse(exported).success).toBe(
      true,
    );
    expect(exported.basedOn).toEqual(pattern.basedOn);
    expect(
      observer.metrics.some(
        (metric) =>
          metric.name === 'distillation_export_total' &&
          metric.labels?.exportType === 'phase6_distilled_pattern',
      ),
    ).toBe(true);
  });

  it('builds lifecycle snapshots and confidence exports from canonical pattern plus source records', async () => {
    const cluster = makeAgingCluster();
    const pattern = makePatternFromCluster(cluster, {
      confidence: 0.67,
    });

    const snapshot = createPatternLifecycleSnapshot(pattern, cluster.records, {
      referenceAt: NOW,
    });
    const exported = await toPhase6ConfidenceSignalExport(snapshot);

    expect(snapshot.stalenessStatus).toBe('aging');
    expect(snapshot.decayState).toBe('decaying');
    expect(
      Phase6ConfidenceSignalExportSchema.safeParse(exported).success,
    ).toBe(true);
    expect(exported.patternId).toBe(pattern.id);
  });

  it('creates learned behavior explanations and escalation signals that satisfy shared schemas', async () => {
    const cluster = makeAgingCluster();
    const pattern = makePatternFromCluster(cluster);
    const analysis = analyzeSourceRecords(cluster.records, { referenceAt: NOW });

    const explanation = await toLearnedBehaviorExplanation(pattern, 'outcome-ref');
    const signal = await toEscalationSignal({
      analysis,
      decision: {
        decision: 'hold',
        confidence: pattern.confidence,
        tier: 'medium',
        supersessionEligible: false,
        decayState: 'decaying',
        reasonCodes: ['CONF-STALENESS'],
        validationErrors: [],
      },
      patternId: pattern.id,
    });

    expect(LearnedBehaviorExplanationSchema.safeParse(explanation).success).toBe(
      true,
    );
    expect(EscalationSignalSchema.safeParse(signal).success).toBe(true);
    expect(signal.reasonCode).toBe('CONF-STALENESS');
  });
});
