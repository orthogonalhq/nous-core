import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  PersonalityConfig as CortexPersonalityConfig,
  PersonalityPreset as CortexPersonalityPreset,
  TraitAxes as CortexTraitAxes,
} from '../../../gateway-runtime/personality/index.js';
import type {
  PersonalityConfig as SharedPersonalityConfig,
  PersonalityPreset as SharedPersonalityPreset,
  TraitAxes as SharedTraitAxes,
} from '@nous/shared';

// ---------------------------------------------------------------------------
// T1.10 — Structural mirror drift detector (SDS F7, Goals C10)
//
// The @nous/shared structural mirror adjacent to PromptFormatterInput is a
// self-contained declaration. This test asserts bidirectional assignment
// compatibility between the cortex canonical `PersonalityConfig` surface and
// the shared structural mirror. If either surface drifts (e.g. a new trait
// axis is added in cortex but not mirrored in @nous/shared), the type
// assertions below fail at build time.
// ---------------------------------------------------------------------------

describe('shared ↔ cortex PersonalityConfig structural compatibility', () => {
  it('cortex PersonalityConfig is assignable to the shared mirror', () => {
    expectTypeOf<CortexPersonalityConfig>().toMatchTypeOf<SharedPersonalityConfig>();
  });

  it('shared PersonalityConfig is assignable to the cortex canonical', () => {
    expectTypeOf<SharedPersonalityConfig>().toMatchTypeOf<CortexPersonalityConfig>();
  });

  it('PersonalityPreset unions are bidirectionally assignable', () => {
    expectTypeOf<CortexPersonalityPreset>().toMatchTypeOf<SharedPersonalityPreset>();
    expectTypeOf<SharedPersonalityPreset>().toMatchTypeOf<CortexPersonalityPreset>();
  });

  it('TraitAxes shapes are bidirectionally assignable', () => {
    expectTypeOf<CortexTraitAxes>().toMatchTypeOf<SharedTraitAxes>();
    expectTypeOf<SharedTraitAxes>().toMatchTypeOf<CortexTraitAxes>();
  });

  it('round-trips a concrete value through the shared mirror boundary', () => {
    const cortexValue: CortexPersonalityConfig = {
      preset: 'professional',
      overrides: { candor: 'standard' },
    };
    const viaShared = ((c: SharedPersonalityConfig): SharedPersonalityConfig => c)(
      cortexValue,
    );
    const backToCortex: CortexPersonalityConfig = viaShared;
    expect(backToCortex).toEqual(cortexValue);
    expect(backToCortex.preset).toBe('professional');
    expect(backToCortex.overrides?.candor).toBe('standard');
  });
});
