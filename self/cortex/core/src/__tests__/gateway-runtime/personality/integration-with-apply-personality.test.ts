import { describe, expect, it } from 'vitest';
import type { AgentClass } from '@nous/shared';
import { resolveAgentProfile } from '../../../gateway-runtime/prompt-strategy.js';
import {
  PRESETS,
  TRAIT_REGISTRY,
  type PersonalityPreset,
  type TraitAxes,
  type TraitValueDefinition,
} from '../../../gateway-runtime/personality/index.js';

const ALL_AGENT_CLASSES: AgentClass[] = [
  'Cortex::Principal',
  'Cortex::System',
  'Orchestrator',
  'Worker',
];

const NON_BALANCED_PRESETS: PersonalityPreset[] = [
  'professional',
  'efficient',
  'thorough',
];

const ALL_PRESETS: PersonalityPreset[] = ['balanced', ...NON_BALANCED_PRESETS];

// Mirrors the production iteration order in `collectFragmentsByTarget` /
// `applyPersonalityToIdentity`: TRAIT_REGISTRY tuple order, identity-targeted
// fragments first, then outputContract-targeted fragments. See SDS § 3.3.3.
function expectedIdentityFragments(axes: TraitAxes): string[] {
  const identity: string[] = [];
  const outputContract: string[] = [];
  for (const trait of TRAIT_REGISTRY) {
    const values = trait.values as Record<string, TraitValueDefinition>;
    const selectedKey = axes[trait.id as keyof TraitAxes];
    const injection = values[selectedKey].injection;
    if (injection == null) continue;
    if (injection.target === 'identity') {
      identity.push(injection.fragment);
    } else {
      outputContract.push(injection.fragment);
    }
  }
  return [...identity, ...outputContract];
}

// ---------------------------------------------------------------------------
// Block A — `{ preset: 'balanced' }` byte-identity (T2.5, I2, R9 Block A, C13)
// ---------------------------------------------------------------------------

describe('{ preset: "balanced" } byte-identity (Block A)', () => {
  it.each(ALL_AGENT_CLASSES)(
    '%s: balanced identity strictly equal to no-personality baseline',
    (agentClass) => {
      const balanced = resolveAgentProfile(agentClass, undefined, {
        preset: 'balanced',
      });
      const baseline = resolveAgentProfile(agentClass);
      expect(balanced.identity).toBe(baseline.identity);
    },
  );

  it('every standard-variant axis yields zero fragments', () => {
    const fragments = expectedIdentityFragments(PRESETS.balanced);
    expect(fragments).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Block B — non-balanced presets produce expected fragment concatenation
// (T2.1, R9 Block B, C11)
// ---------------------------------------------------------------------------

describe('non-balanced presets produce expected fragment concatenation (Block B)', () => {
  for (const preset of NON_BALANCED_PRESETS) {
    describe(`preset: ${preset}`, () => {
      it.each(ALL_AGENT_CLASSES)(
        `%s: identity = [base, ...TRAIT_REGISTRY-order fragments].join('\\n\\n')`,
        (agentClass) => {
          const baseline = resolveAgentProfile(agentClass);
          const withPersonality = resolveAgentProfile(agentClass, undefined, {
            preset,
          });
          const fragments = expectedIdentityFragments(PRESETS[preset]);
          expect(fragments.length).toBeGreaterThan(0);
          const expected = [baseline.identity, ...fragments].join('\n\n');
          expect(withPersonality.identity).toBe(expected);
        },
      );

      it.each(ALL_AGENT_CLASSES)(
        `%s: identity differs from baseline`,
        (agentClass) => {
          const baseline = resolveAgentProfile(agentClass);
          const withPersonality = resolveAgentProfile(agentClass, undefined, {
            preset,
          });
          expect(withPersonality.identity).not.toBe(baseline.identity);
        },
      );
    });
  }
});

// ---------------------------------------------------------------------------
// Block C — applyPersonalityToOutputContract is a deliberate pass-through
// (T2.2, Note 1 Option a / ADR 017, I3, C12 updated, C17)
// ---------------------------------------------------------------------------

describe('applyPersonalityToOutputContract is a deliberate pass-through', () => {
  for (const preset of ALL_PRESETS) {
    it.each(ALL_AGENT_CLASSES)(
      `${preset}: %s outputContract strictly equal to baseline`,
      (agentClass) => {
        const baseline = resolveAgentProfile(agentClass);
        const withPersonality = resolveAgentProfile(agentClass, undefined, {
          preset,
        });
        expect(withPersonality.outputContract).toBe(baseline.outputContract);
      },
    );
  }

  it.each(ALL_AGENT_CLASSES)(
    'preset + overrides: %s outputContract strictly equal to baseline',
    (agentClass) => {
      const baseline = resolveAgentProfile(agentClass);
      const withOverrides = resolveAgentProfile(agentClass, undefined, {
        preset: 'professional',
        overrides: { candor: 'standard' },
      });
      expect(withOverrides.outputContract).toBe(baseline.outputContract);
    },
  );
});
