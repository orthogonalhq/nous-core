/**
 * Personality module barrel (WR-128 / SP 1.2).
 *
 * Every public symbol listed in Goals C2 (`PersonalityConfig`,
 * `PersonalityPreset`, `TraitAxes`, `TRAIT_REGISTRY`, `PRESETS`,
 * `resolvePersonality`) is resolvable from a single import of this file.
 * No symbol is re-exported from more than one underlying file.
 */

export type {
  TraitInjection,
  TraitValueDefinition,
  TraitDefinition,
  TraitAxes,
} from './registry.js';
export { defineTrait, TRAIT_REGISTRY } from './registry.js';

export type { PersonalityPreset, PersonalityConfig } from './presets.js';
export { PRESETS } from './presets.js';

export type { FragmentsByTarget } from './resolver.js';
export { resolvePersonality, collectFragmentsByTarget } from './resolver.js';
