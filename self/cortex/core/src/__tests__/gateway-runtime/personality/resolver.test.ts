import { describe, expect, it } from 'vitest';
import {
  PRESETS,
  resolvePersonality,
  type PersonalityPreset,
  type TraitAxes,
} from '../../../gateway-runtime/personality/index.js';

// ---------------------------------------------------------------------------
// T1.6 — PRESETS byte-equality (SDS I1, Goals C6)
// ---------------------------------------------------------------------------

describe('PRESETS byte-equality (SDS § 3.4 / Decision 1 § Presets as Trait Value Maps)', () => {
  it('balanced matches Decision 1 verbatim', () => {
    expect(PRESETS.balanced).toEqual({
      thoroughness: 'standard',
      initiative: 'compliant',
      candor: 'standard',
      communicationStyle: 'concise',
      codeStyle: 'standard',
    } satisfies TraitAxes);
  });

  it('professional matches Decision 1 verbatim', () => {
    expect(PRESETS.professional).toEqual({
      thoroughness: 'strict',
      initiative: 'collaborative',
      candor: 'strict',
      communicationStyle: 'detailed',
      codeStyle: 'minimal',
    } satisfies TraitAxes);
  });

  it('efficient matches Decision 1 verbatim', () => {
    expect(PRESETS.efficient).toEqual({
      thoroughness: 'standard',
      initiative: 'compliant',
      candor: 'standard',
      communicationStyle: 'concise',
      codeStyle: 'minimal',
    } satisfies TraitAxes);
  });

  it('thorough matches Decision 1 verbatim', () => {
    expect(PRESETS.thorough).toEqual({
      thoroughness: 'strict',
      initiative: 'compliant',
      candor: 'strict',
      communicationStyle: 'detailed',
      codeStyle: 'standard',
    } satisfies TraitAxes);
  });
});

// ---------------------------------------------------------------------------
// T1.7 — resolvePersonality: preset → axes (Goals C14 baseline)
// ---------------------------------------------------------------------------

const ALL_PRESETS: PersonalityPreset[] = [
  'balanced',
  'professional',
  'efficient',
  'thorough',
];

describe('resolvePersonality — preset → axes', () => {
  for (const preset of ALL_PRESETS) {
    it(`${preset} resolves to PRESETS[${preset}]`, () => {
      expect(resolvePersonality({ preset })).toEqual(PRESETS[preset]);
    });
  }
});

// ---------------------------------------------------------------------------
// T1.8 — resolvePersonality: overrides win (Goals C14)
// ---------------------------------------------------------------------------

describe('resolvePersonality — overrides win on specified axes', () => {
  it('candor override replaces the professional preset value', () => {
    expect(
      resolvePersonality({
        preset: 'professional',
        overrides: { candor: 'standard' },
      }),
    ).toEqual({ ...PRESETS.professional, candor: 'standard' });
  });
});

// ---------------------------------------------------------------------------
// T1.9 — resolvePersonality: multiple overrides (Goals C14 extended)
// ---------------------------------------------------------------------------

describe('resolvePersonality — multiple overrides', () => {
  it('overrides on two axes both apply; unset axes retain preset values', () => {
    const axes = resolvePersonality({
      preset: 'thorough',
      overrides: { initiative: 'collaborative', codeStyle: 'minimal' },
    });
    expect(axes).toEqual({
      ...PRESETS.thorough,
      initiative: 'collaborative',
      codeStyle: 'minimal',
    });
    // Unset axes retain preset values.
    expect(axes.thoroughness).toBe(PRESETS.thorough.thoroughness);
    expect(axes.candor).toBe(PRESETS.thorough.candor);
    expect(axes.communicationStyle).toBe(PRESETS.thorough.communicationStyle);
  });
});

// ---------------------------------------------------------------------------
// T3.3 — All-axes override collapses to another preset (Goals C14 edge)
// ---------------------------------------------------------------------------

describe('resolvePersonality — all-axes override collapses to another preset', () => {
  it('balanced + full override set equals professional preset', () => {
    expect(
      resolvePersonality({
        preset: 'balanced',
        overrides: {
          thoroughness: 'strict',
          initiative: 'collaborative',
          candor: 'strict',
          communicationStyle: 'detailed',
          codeStyle: 'minimal',
        },
      }),
    ).toEqual(PRESETS.professional);
  });
});
