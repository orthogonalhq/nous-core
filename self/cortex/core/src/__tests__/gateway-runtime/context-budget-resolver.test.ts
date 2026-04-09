import { describe, expect, it } from 'vitest';
import {
  resolveContextBudget,
  type ContextBudgetResolutionContext,
  type ContextBudgetSettingsSource,
} from '../../gateway-runtime/context-budget-resolver.js';
import type { ContextBudgetDefaults } from '../../gateway-runtime/prompt-strategy.js';

const CTX: ContextBudgetResolutionContext = { agentClass: 'Worker' };
const PROFILE_DEFAULT: ContextBudgetDefaults = {
  maxContextTokens: 16_000,
  compactionThreshold: 0.6,
  maxTurns: 10,
};

function makeSource(settings: ReturnType<ContextBudgetSettingsSource['getSettings']>): ContextBudgetSettingsSource {
  return { getSettings: () => settings };
}

describe('resolveContextBudget', () => {
  it('returns profileDefault when no sources provided', () => {
    const result = resolveContextBudget(CTX, PROFILE_DEFAULT);
    expect(result).toEqual(PROFILE_DEFAULT);
  });

  it('returns profileDefault when sources array is empty', () => {
    const result = resolveContextBudget(CTX, PROFILE_DEFAULT, []);
    expect(result).toEqual(PROFILE_DEFAULT);
  });

  it('overrides all fields from a single source', () => {
    const source = makeSource({
      maxContextTokens: 64_000,
      compactionThreshold: 0.9,
      maxTurns: 50,
    });
    const result = resolveContextBudget(CTX, PROFILE_DEFAULT, [source]);
    expect(result).toEqual({
      maxContextTokens: 64_000,
      compactionThreshold: 0.9,
      maxTurns: 50,
    });
  });

  it('overrides only specified fields — others fall through to profile', () => {
    const source = makeSource({ maxContextTokens: 32_000 });
    const result = resolveContextBudget(CTX, PROFILE_DEFAULT, [source]);
    expect(result).toEqual({
      maxContextTokens: 32_000,
      compactionThreshold: 0.6,
      maxTurns: 10,
    });
  });

  it('first source wins per field (most specific takes precedence)', () => {
    const nodeSource = makeSource({ maxContextTokens: 8_000 });
    const projectSource = makeSource({ maxContextTokens: 48_000, maxTurns: 20 });
    const result = resolveContextBudget(CTX, PROFILE_DEFAULT, [nodeSource, projectSource]);
    expect(result.maxContextTokens).toBe(8_000); // node wins
    expect(result.maxTurns).toBe(20); // project provides
    expect(result.compactionThreshold).toBe(0.6); // profile default
  });

  it('skips source that returns undefined', () => {
    const emptySource = makeSource(undefined);
    const realSource = makeSource({ maxTurns: 25 });
    const result = resolveContextBudget(CTX, PROFILE_DEFAULT, [emptySource, realSource]);
    expect(result.maxTurns).toBe(25);
    expect(result.maxContextTokens).toBe(16_000);
  });

  it('uses profile default when all sources return undefined for a field', () => {
    const source1 = makeSource(undefined);
    const source2 = makeSource({});
    const result = resolveContextBudget(CTX, PROFILE_DEFAULT, [source1, source2]);
    expect(result).toEqual(PROFILE_DEFAULT);
  });

  it('resolves each field independently across mixed sources', () => {
    const s1 = makeSource({ maxContextTokens: 100 });
    const s2 = makeSource({ compactionThreshold: 0.5, maxTurns: 3 });
    const s3 = makeSource({ maxContextTokens: 999, compactionThreshold: 0.1 });
    const result = resolveContextBudget(CTX, PROFILE_DEFAULT, [s1, s2, s3]);
    expect(result.maxContextTokens).toBe(100); // s1
    expect(result.compactionThreshold).toBe(0.5); // s2
    expect(result.maxTurns).toBe(3); // s2
  });
});
