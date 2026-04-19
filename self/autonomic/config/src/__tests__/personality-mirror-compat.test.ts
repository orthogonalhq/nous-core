/**
 * Personality structural-mirror compatibility test (SP 1.3 / SDS § 6.1 H5).
 *
 * Mirrors SP 1.2's `shared-interface-compatibility.test.ts` precedent: assert
 * assignment compatibility in BOTH directions between the canonical
 * `PersonalityConfig` declared in `@nous/autonomic-config`'s schema (Zod-derived)
 * and the structural mirror declared in `@nous/shared`'s `interfaces/agent-gateway.ts`
 * (per ADR 018 layering invariant).
 *
 * Compile-time pass is the assertion. Runtime asserts that the two values
 * survive a JSON round-trip with the same shape.
 */
import { describe, it, expect } from 'vitest';
import type { PersonalityConfig as SharedPersonalityConfig } from '@nous/shared';
import type { PersonalityConfig as AutonomicPersonalityConfig } from '../schema.js';

function acceptsAutonomic(config: AutonomicPersonalityConfig): AutonomicPersonalityConfig {
  return config;
}

function acceptsShared(config: SharedPersonalityConfig): SharedPersonalityConfig {
  return config;
}

describe('PersonalityConfig structural-mirror compatibility (ADR 018 / SDS I1)', () => {
  it('accepts an autonomic-config value where a shared value is expected', () => {
    const autonomic: AutonomicPersonalityConfig = { preset: 'balanced' };
    // Compile-time assertion: AutonomicPersonalityConfig is assignable to
    // SharedPersonalityConfig.
    const shared: SharedPersonalityConfig = autonomic;
    expect(acceptsShared(shared)).toEqual(autonomic);
  });

  it('accepts a shared value where an autonomic-config value is expected', () => {
    const shared: SharedPersonalityConfig = {
      preset: 'professional',
      overrides: { thoroughness: 'strict' },
    };
    // Compile-time assertion: SharedPersonalityConfig is assignable to
    // AutonomicPersonalityConfig.
    const autonomic: AutonomicPersonalityConfig = shared;
    expect(acceptsAutonomic(autonomic)).toEqual(shared);
  });

  it('round-trips both shapes through JSON without drift', () => {
    const fixture: SharedPersonalityConfig = {
      preset: 'thorough',
      overrides: {
        candor: 'standard',
        codeStyle: 'minimal',
      },
    };
    const roundTripped = JSON.parse(JSON.stringify(fixture)) as AutonomicPersonalityConfig;
    expect(roundTripped).toEqual(fixture);
  });
});
