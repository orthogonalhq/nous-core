import { ExperienceClusterSchema, ExperienceRecordSchema } from '@nous/shared';
import {
  DistillationPrototypeScenarioSchema,
  type DistillationPrototypeScenario,
} from '../../prototype-contracts.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
const TRACE_ID = '550e8400-e29b-41d4-a716-446655440001';
const CREATED_AT = '2026-02-01T00:00:00.000Z';

type Sentiment =
  | 'strong-positive'
  | 'weak-positive'
  | 'neutral'
  | 'weak-negative'
  | 'strong-negative';

function makeRecord(
  idSuffix: string,
  sentiment: Sentiment,
  updatedAt: string,
  reason: string,
) {
  return ExperienceRecordSchema.parse({
    id: `550e8400-e29b-41d4-a716-44665544${idSuffix}`,
    content: `Record ${idSuffix}`,
    type: 'experience-record',
    scope: 'project',
    projectId: PROJECT_ID,
    confidence: 0.8,
    sensitivity: [],
    retention: 'permanent',
    provenance: {
      traceId: TRACE_ID,
      source: 'phase-8.4-fixture',
      timestamp: CREATED_AT,
    },
    tags: ['phase-8.4', 'distillation-prototype'],
    sentiment,
    context: `Context ${idSuffix}`,
    action: `Action ${idSuffix}`,
    outcome: `Outcome ${idSuffix}`,
    reason,
    createdAt: CREATED_AT,
    updatedAt,
  });
}

function makeCluster(records: ReturnType<typeof makeRecord>[]) {
  return ExperienceClusterSchema.parse({
    records,
    clusterKey: records.map((record) => record.id).sort().join(','),
    projectId: PROJECT_ID,
  });
}

function createAlignedRecords() {
  return Array.from({ length: 15 }, (_, index) =>
    makeRecord(
      `${(1000 + index).toString().padStart(4, '0')}`,
      index < 10 ? 'strong-positive' : 'weak-positive',
      `2026-03-${((index % 5) + 2).toString().padStart(2, '0')}T00:00:00.000Z`,
      `Consistent support reason ${index + 1}`,
    ),
  );
}

function createMixedSignalRecords() {
  return [
    makeRecord('2000', 'strong-positive', '2026-03-01T00:00:00.000Z', 'Positive signal 1'),
    makeRecord('2001', 'strong-positive', '2026-03-02T00:00:00.000Z', 'Positive signal 2'),
    makeRecord('2002', 'weak-positive', '2026-03-02T00:00:00.000Z', 'Positive signal 3'),
    makeRecord('2003', 'weak-positive', '2026-03-03T00:00:00.000Z', 'Positive signal 4'),
    makeRecord('2004', 'weak-negative', '2026-03-03T00:00:00.000Z', 'Negative signal 1'),
    makeRecord('2005', 'weak-negative', '2026-03-03T00:00:00.000Z', 'Negative signal 2'),
  ];
}

function createBlockingContradictionRecords() {
  return [
    makeRecord('3000', 'strong-positive', '2026-03-05T00:00:00.000Z', 'Positive conflict 1'),
    makeRecord('3001', 'strong-positive', '2026-03-05T00:00:00.000Z', 'Positive conflict 2'),
    makeRecord('3002', 'strong-positive', '2026-03-06T00:00:00.000Z', 'Positive conflict 3'),
    makeRecord('3003', 'strong-negative', '2026-03-05T00:00:00.000Z', 'Negative conflict 1'),
    makeRecord('3004', 'strong-negative', '2026-03-06T00:00:00.000Z', 'Negative conflict 2'),
    makeRecord('3005', 'strong-negative', '2026-03-06T00:00:00.000Z', 'Negative conflict 3'),
  ];
}

function createStaleRecords() {
  return [
    makeRecord('4000', 'strong-positive', '2026-02-20T00:00:00.000Z', 'Historical support 1'),
    makeRecord('4001', 'strong-positive', '2026-02-21T00:00:00.000Z', 'Historical support 2'),
    makeRecord('4002', 'weak-positive', '2026-02-21T00:00:00.000Z', 'Historical support 3'),
    makeRecord('4003', 'weak-positive', '2026-02-22T00:00:00.000Z', 'Historical support 4'),
    makeRecord('4004', 'strong-positive', '2026-02-23T00:00:00.000Z', 'Historical support 5'),
    makeRecord('4005', 'weak-positive', '2026-02-24T00:00:00.000Z', 'Historical support 6'),
  ];
}

export const STABLE_PROMOTION_SCENARIO: DistillationPrototypeScenario =
  DistillationPrototypeScenarioSchema.parse({
    id: 'stable-promotion',
    description:
      'Aligned recent evidence should remain promotion eligible with full trace coverage.',
    cluster: makeCluster(createAlignedRecords()),
    evaluationWindowDays: 7,
    expected: {
      promotionDecision: 'promote',
      contradictionStatus: 'none',
      stalenessStatus: 'fresh',
      requiresFullTraceCoverage: true,
      requiresSupersessionBlockOnFailure: true,
    },
  });

export const MIXED_SIGNAL_SCENARIO: DistillationPrototypeScenario =
  DistillationPrototypeScenarioSchema.parse({
    id: 'mixed-signal-aging',
    description:
      'Mixed-signal but majority-positive evidence should hold rather than promote until refreshed.',
    cluster: makeCluster(createMixedSignalRecords()),
    evaluationWindowDays: 7,
    expected: {
      promotionDecision: 'hold',
      contradictionStatus: 'detected',
      stalenessStatus: 'aging',
      requiresFullTraceCoverage: true,
      requiresSupersessionBlockOnFailure: true,
    },
  });

export const BLOCKING_CONTRADICTION_SCENARIO: DistillationPrototypeScenario =
  DistillationPrototypeScenarioSchema.parse({
    id: 'blocking-contradiction',
    description:
      'Evenly split recent evidence should reject promotion because contradiction is blocking.',
    cluster: makeCluster(createBlockingContradictionRecords()),
    evaluationWindowDays: 7,
    expected: {
      promotionDecision: 'reject',
      contradictionStatus: 'blocking',
      stalenessStatus: 'fresh',
      requiresFullTraceCoverage: true,
      requiresSupersessionBlockOnFailure: true,
    },
  });

export const STALE_HOLD_SCENARIO: DistillationPrototypeScenario =
  DistillationPrototypeScenarioSchema.parse({
    id: 'stale-hold',
    description:
      'Aligned historical evidence should hold rather than promote when it has gone stale.',
    cluster: makeCluster(createStaleRecords()),
    evaluationWindowDays: 7,
    expected: {
      promotionDecision: 'hold',
      contradictionStatus: 'none',
      stalenessStatus: 'stale',
      requiresFullTraceCoverage: true,
      requiresSupersessionBlockOnFailure: true,
    },
  });

export const PROTOTYPE_SCENARIOS: DistillationPrototypeScenario[] = [
  STABLE_PROMOTION_SCENARIO,
  MIXED_SIGNAL_SCENARIO,
  BLOCKING_CONTRADICTION_SCENARIO,
  STALE_HOLD_SCENARIO,
];
