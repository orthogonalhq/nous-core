/**
 * Confidence formula tests.
 * Phase 4.3: Initial confidence deterministic; refresh/decay formulas.
 */
import { describe, it, expect } from 'vitest';
import { computeInitialConfidence } from '../confidence.js';
import type { ExperienceRecord } from '@nous/shared';
import { ExperienceRecordSchema } from '@nous/shared';
import { DEFAULT_CONFIDENCE_LIFECYCLE } from '@nous/shared';

const NOW = new Date().toISOString();
const PROJ = '550e8400-e29b-41d4-a716-446655440000';

const TRACE = '550e8400-e29b-41d4-a716-446655440001';

function makeRecord(sentiment: ExperienceRecord['sentiment']): ExperienceRecord {
  return ExperienceRecordSchema.parse({
    id: crypto.randomUUID(),
    content: 'ctx',
    type: 'experience-record',
    scope: 'project',
    projectId: PROJ,
    confidence: 0.8,
    sensitivity: [],
    retention: 'permanent',
    provenance: { traceId: TRACE, source: 'test', timestamp: NOW },
    tags: [],
    sentiment,
    context: 'ctx',
    action: 'act',
    outcome: 'out',
    reason: 'reason',
    createdAt: NOW,
    updatedAt: NOW,
  });
}

describe('computeInitialConfidence', () => {
  it('returns 0 when below minSupportingSignals', () => {
    const records = [
      makeRecord('strong-positive'),
      makeRecord('strong-positive'),
    ];
    expect(computeInitialConfidence(records)).toBe(0);
  });

  it('is deterministic for equivalent input', () => {
    const records = [
      makeRecord('strong-positive'),
      makeRecord('strong-positive'),
      makeRecord('strong-positive'),
    ];
    const c1 = computeInitialConfidence(records);
    const c2 = computeInitialConfidence(records);
    expect(c1).toBe(c2);
  });

  it('higher consistency yields higher confidence', () => {
    const allPositive = [
      makeRecord('strong-positive'),
      makeRecord('strong-positive'),
      makeRecord('weak-positive'),
    ];
    const mixed = [
      makeRecord('strong-positive'),
      makeRecord('strong-negative'),
      makeRecord('neutral'),
    ];
    const confAll = computeInitialConfidence(allPositive);
    const confMixed = computeInitialConfidence(mixed);
    expect(confAll).toBeGreaterThan(confMixed);
  });

  it('volume factor caps at 1', () => {
    const many = Array.from({ length: 20 }, () =>
      makeRecord('strong-positive'),
    );
    const conf = computeInitialConfidence(many);
    expect(conf).toBeLessThanOrEqual(1);
  });
});
