/**
 * Personality presets (WR-128 / SP 1.2).
 *
 * `PRESETS` is byte-equal to Decision 1 § Presets as Trait Value Maps and
 * SDS § 3.4. `{ preset: 'balanced' }` yields every trait at its baseline
 * variant — all `injection: null` — so identity concatenation is a no-op
 * (SDS I2).
 */
import type { TraitAxes } from './registry.js';

export type PersonalityPreset =
  | 'balanced'
  | 'professional'
  | 'efficient'
  | 'thorough';

export const PRESETS: Record<PersonalityPreset, TraitAxes> = {
  balanced: {
    thoroughness: 'standard',
    initiative: 'compliant',
    candor: 'standard',
    communicationStyle: 'concise',
    codeStyle: 'standard',
  },
  professional: {
    thoroughness: 'strict',
    initiative: 'collaborative',
    candor: 'strict',
    communicationStyle: 'detailed',
    codeStyle: 'minimal',
  },
  efficient: {
    thoroughness: 'standard',
    initiative: 'compliant',
    candor: 'standard',
    communicationStyle: 'concise',
    codeStyle: 'minimal',
  },
  thorough: {
    thoroughness: 'strict',
    initiative: 'compliant',
    candor: 'strict',
    communicationStyle: 'detailed',
    codeStyle: 'standard',
  },
};

/**
 * User-selected personality configuration: one of four presets, optionally
 * with per-axis overrides shallow-merged on top. SP 1.2 is the canonical
 * definition site; `@nous/shared` carries a structural mirror adjacent to
 * `PromptFormatterInput` (SDS § 1.4, ADR 018).
 */
export interface PersonalityConfig {
  readonly preset: PersonalityPreset;
  readonly overrides?: Partial<TraitAxes>;
}
