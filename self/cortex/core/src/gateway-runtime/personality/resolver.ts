/**
 * Personality resolver (WR-128 / SP 1.2).
 *
 * `resolvePersonality`     — collapses `PersonalityConfig` into a concrete
 *                            `TraitAxes` by shallow-merging overrides onto
 *                            the preset base.
 * `collectFragmentsByTarget` — given effective axes, returns two fragment
 *                            lists (identity / outputContract) built in
 *                            `TRAIT_REGISTRY` tuple order (SDS I5).
 *
 * Under Note 1 Option (a) / ADR 017, the caller (`applyPersonalityToIdentity`)
 * concatenates both lists onto the identity block; `applyPersonalityToOutputContract`
 * is a deliberate pass-through on the enum surface.
 */
import {
  TRAIT_REGISTRY,
  type TraitAxes,
  type TraitValueDefinition,
} from './registry.js';
import { PRESETS, type PersonalityConfig } from './presets.js';

export function resolvePersonality(config: PersonalityConfig): TraitAxes {
  return { ...PRESETS[config.preset], ...config.overrides };
}

export interface FragmentsByTarget {
  readonly identity: readonly string[];
  readonly outputContract: readonly string[];
}

export function collectFragmentsByTarget(axes: TraitAxes): FragmentsByTarget {
  const identity: string[] = [];
  const outputContract: string[] = [];
  // The heterogeneous tuple narrows `trait.values` to a union whose shared
  // index signature is `never`. We widen to the common structural type
  // (`Record<string, TraitValueDefinition>`) for the per-trait lookup; the
  // per-trait `defineTrait` signature still preserves narrowness for external
  // consumers (SDS I6).
  for (const trait of TRAIT_REGISTRY) {
    const values = trait.values as Record<string, TraitValueDefinition>;
    const selectedValueKey = axes[trait.id as keyof TraitAxes];
    const injection = values[selectedValueKey].injection;
    if (injection == null) continue;
    if (injection.target === 'identity') {
      identity.push(injection.fragment);
    } else if (injection.target === 'outputContract') {
      outputContract.push(injection.fragment);
    }
  }
  return { identity, outputContract };
}
