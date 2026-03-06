import { describe, it, expect } from 'vitest';
import {
  ApiContractRangeEvaluationSchema,
  CapabilityDeltaSchema,
  calculateCapabilityDelta,
  evaluateApiContractRange,
} from '../../types/package-compatibility.js';

describe('evaluateApiContractRange', () => {
  it('returns true when runtime satisfies manifest range', () => {
    expect(evaluateApiContractRange('^1.0.0', '1.2.3')).toBe(true);
  });

  it('returns false when runtime does not satisfy manifest range', () => {
    expect(evaluateApiContractRange('^2.0.0', '1.9.9')).toBe(false);
  });

  it('returns false for invalid semver inputs', () => {
    expect(evaluateApiContractRange('not-a-range', '1.2.3')).toBe(false);
    expect(evaluateApiContractRange('^1.0.0', 'not-a-version')).toBe(false);
  });
});

describe('calculateCapabilityDelta', () => {
  it('requires reapproval when capabilities expand', () => {
    const delta = calculateCapabilityDelta(
      ['model.invoke'],
      ['model.invoke', 'tool.execute'],
    );
    expect(delta.added).toEqual(['tool.execute']);
    expect(delta.removed).toEqual([]);
    expect(delta.requires_reapproval).toBe(true);
  });

  it('does not require reapproval when capabilities only shrink', () => {
    const delta = calculateCapabilityDelta(
      ['model.invoke', 'tool.execute'],
      ['model.invoke'],
    );
    expect(delta.added).toEqual([]);
    expect(delta.removed).toEqual(['tool.execute']);
    expect(delta.requires_reapproval).toBe(false);
  });
});

describe('compatibility schemas', () => {
  it('accepts valid API range evaluation payloads', () => {
    const result = ApiContractRangeEvaluationSchema.safeParse({
      manifest_range: '^1.0.0',
      runtime_sdk_version: '1.2.3',
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

