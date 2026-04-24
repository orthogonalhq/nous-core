/**
 * UT-C1..UT-C4 — Classifier dispatch matrix.
 */
import { describe, expect, it, vi } from 'vitest';
import { classify } from '../classifier.js';
import { DETECTORS } from '../detection/index.js';
import { baseObservation, buildContext } from './detection/test-helpers.js';
import type { DetectorFn } from '../detection/types.js';

describe('classify — dispatch matrix', () => {
  it('UT-C1 — benign observation returns empty array', async () => {
    const result = await classify(baseObservation(), buildContext());
    expect(result).toEqual([]);
  });

  it('UT-C2 — SUP-003-tripping observation returns one record with supCode SUP-003', async () => {
    const workerSurface = {
      agentClass: 'Worker' as const,
      allowedToolNames: ['read_file'],
      isAllowed: (t: string): boolean => t === 'read_file',
    };
    const records = await classify(
      baseObservation({
        agentClass: 'Worker',
        toolCall: { name: 'send_email', params: {} },
      }),
      buildContext({ toolSurface: workerSurface }),
    );
    expect(records).toHaveLength(1);
    expect(records[0]?.supCode).toBe('SUP-003');
    expect(records[0]?.severity).toBe('S1');
  });

  it('UT-C3 — Worker dispatch_agent with restricted surface trips SUP-001 AND SUP-003, SUP-001 first', async () => {
    const restrictedSurface = {
      agentClass: 'Worker' as const,
      allowedToolNames: ['read_file'],
      isAllowed: (t: string): boolean => t === 'read_file',
    };
    const records = await classify(
      baseObservation({
        agentClass: 'Worker',
        toolCall: { name: 'dispatch_agent', params: {} },
      }),
      buildContext({ toolSurface: restrictedSurface }),
    );
    const codes = records.map((r) => r.supCode);
    expect(codes).toContain('SUP-001');
    expect(codes).toContain('SUP-003');
    expect(codes.indexOf('SUP-001')).toBeLessThan(codes.indexOf('SUP-003'));
  });

  it('UT-C4 — injected clock populates detectedAt deterministically', async () => {
    const fixed = '2026-04-22T12:34:56.000Z';
    const context = buildContext({
      now: () => fixed,
      toolSurface: {
        agentClass: 'Worker',
        allowedToolNames: ['read_file'],
        isAllowed: (t) => t === 'read_file',
      },
    });
    const records = await classify(
      baseObservation({
        agentClass: 'Worker',
        toolCall: { name: 'write_file', params: {} },
      }),
      context,
    );
    expect(records).toHaveLength(1);
    expect(records[0]?.detectedAt).toBe(fixed);
  });

  it('DETECTORS is frozen and carries all 8 detectors in order', () => {
    expect(DETECTORS).toHaveLength(8);
    expect(Object.isFrozen(DETECTORS)).toBe(true);
  });

  it('per-detector exceptions are isolated; onDetectorError is called', async () => {
    const bad: DetectorFn = async () => {
      throw new Error('intentional');
    };
    const good: DetectorFn = async () => ({
      supCode: 'SUP-005',
      severity: 'S1',
      reason: 'stub',
      detail: {},
    });
    const onError = vi.fn();
    const records = await classify(baseObservation(), buildContext(), {
      detectors: [bad, good],
      onDetectorError: onError,
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(records).toHaveLength(1);
    expect(records[0]?.supCode).toBe('SUP-005');
  });

  it('returns empty array when identity fields are null (defensive gate)', async () => {
    const records = await classify(
      baseObservation({ agentId: null }),
      buildContext(),
    );
    expect(records).toEqual([]);
  });
});
