import { describe, it, expect } from 'vitest';
import {
  ApiContractRangeEvaluationSchema,
  CapabilityDeltaSchema,
  calculateCapabilityDelta,
  evaluateApiContractRange,
} from '../../types/package-compatibility.js';

describe('evaluateApiContractRange', () => {
  it('returns true for compatible runtime versions', () => {
    expect(evaluateApiContractRange('^1.0.0', '1.2.3')).toBe(true);
    expect(evaluateApiContractRange('>=1.0.0 <2.0.0', '1.9.9')).toBe(true);
  });

  it('returns false for incompatible runtime versions', () => {
    expect(evaluateApiContractRange('^1.0.0', '2.0.0')).toBe(false);
  });

  it('fails closed for invalid semver values', () => {
    expect(evaluateApiContractRange('not-a-range', '1.2.3')).toBe(false);
    expect(evaluateApiContractRange('^1.0.0', 'not-a-version')).toBe(false);
  });
});

describe('calculateCapabilityDelta', () => {
  it('calculates added and removed capabilities', () => {
    const delta = calculateCapabilityDelta(
      ['memory.read', 'model.invoke'],
      ['memory.read', 'model.invoke', 'tool.execute'],
    );

    expect(delta.added).toEqual(['tool.execute']);
    expect(delta.removed).toEqual([]);
    expect(delta.requires_reapproval).toBe(true);
  });

  it('does not require reapproval when capabilities only shrink', () => {
    const delta = calculateCapabilityDelta(
      ['memory.read', 'model.invoke'],
      ['memory.read'],
    );

    expect(delta.added).toEqual([]);
    expect(delta.removed).toEqual(['model.invoke']);
    expect(delta.requires_reapproval).toBe(false);
  });
});

describe('Compatibility schemas', () => {
  it('accepts valid compatibility evaluation payloads', () => {
    const result = ApiContractRangeEvaluationSchema.safeParse({
      manifest_range: '^1.0.0',
      runtime_sdk_version: '1.4.2',
      compatible: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid capability deltas', () => {
    const result = CapabilityDeltaSchema.safeParse({
      added: ['tool.execute'],
      removed: [],
      requires_reapproval: true,
    });
    expect(result.success).toBe(true);
  });
});

