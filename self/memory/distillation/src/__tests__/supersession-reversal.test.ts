/**
 * Supersession reversal tests.
 * Phase 4.3: reverseSupersession restores source records to active; pattern retired.
 */
import { describe, it, expect } from 'vitest';
import { reverseSupersession } from '../supersession-reversal.js';
import { InMemoryLtmStore } from '@nous/memory-stubs';
import type { ExperienceRecord, DistilledPattern } from '@nous/shared';
import { ExperienceRecordSchema } from '@nous/shared';

const NOW = new Date().toISOString();
const PROJ = '550e8400-e29b-41d4-a716-446655440000';
const TRACE = '550e8400-e29b-41d4-a716-446655440001';

const ID_A = '550e8400-e29b-41d4-a716-446655440010';
const ID_B = '550e8400-e29b-41d4-a716-446655440011';
const PATTERN_ID = '550e8400-e29b-41d4-a716-446655440020';

function makeRecord(id: string): ExperienceRecord {
  return ExperienceRecordSchema.parse({
    id,
    content: 'ctx',
    type: 'experience-record',
    scope: 'project',
    projectId: PROJ,
    confidence: 0.8,
    sensitivity: [],
    retention: 'permanent',
    provenance: { traceId: TRACE, source: 'test', timestamp: NOW },
    tags: ['tag1'],
    sentiment: 'strong-positive',
    context: 'ctx',
    action: 'act',
    outcome: 'out',
    reason: 'reason',
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function makePattern(id: string, supersedes: string[]): DistilledPattern {
  return {
    id,
    content: 'distilled',
    type: 'distilled-pattern',
    scope: 'project',
    projectId: PROJ,
    confidence: 0.9,
    sensitivity: [],
    retention: 'permanent',
    provenance: { traceId: TRACE, source: 'distillation', timestamp: NOW },
    tags: ['tag1'],
    createdAt: NOW,
    updatedAt: NOW,
    basedOn: supersedes,
    supersedes,
    evidenceRefs: [{ actionCategory: 'memory-write' }],
  };
}

describe('reverseSupersession', () => {
  it('restores source records to active and retires pattern', async () => {
    const ltm = new InMemoryLtmStore();
    const recA = makeRecord(ID_A);
    const recB = makeRecord(ID_B);
    await ltm.write(recA);
    await ltm.write(recB);
    await ltm.markSuperseded([ID_A, ID_B], PATTERN_ID);

    const pattern = makePattern(PATTERN_ID, [ID_A, ID_B]);
    await ltm.write(pattern);

    await reverseSupersession(ltm, {
      patternId: PATTERN_ID,
      reason: 'test rollback',
      evidenceRefs: [{ actionCategory: 'memory-write' }],
    });

    const restoredA = await ltm.read(ID_A);
    const restoredB = await ltm.read(ID_B);
    const retiredPattern = await ltm.read(PATTERN_ID);

    expect(restoredA?.lifecycleStatus).toBe('active');
    expect(restoredA?.supersededBy).toBeUndefined();
    expect(restoredB?.lifecycleStatus).toBe('active');
    expect(restoredB?.supersededBy).toBeUndefined();
    expect(retiredPattern?.lifecycleStatus).toBe('superseded');
  });

  it('throws when pattern not found', async () => {
    const ltm = new InMemoryLtmStore();
    await expect(
      reverseSupersession(ltm, {
        patternId: '550e8400-e29b-41d4-a716-446655440099',
        reason: 'test',
        evidenceRefs: [{ actionCategory: 'memory-write' }],
      }),
    ).rejects.toThrow(/Pattern not found/);
  });

  it('throws when pattern has no source records', async () => {
    const ltm = new InMemoryLtmStore();
    // Pattern with empty supersedes/basedOn (edge case: corrupted or legacy data)
    const pattern = {
      ...makePattern(PATTERN_ID, [ID_A]),
      supersedes: [] as string[],
      basedOn: [] as string[],
    };
    await ltm.write(pattern as any);

    await expect(
      reverseSupersession(ltm, {
        patternId: PATTERN_ID,
        reason: 'test',
        evidenceRefs: [{ actionCategory: 'memory-write' }],
      }),
    ).rejects.toThrow(/no source records to restore/);
  });
});
