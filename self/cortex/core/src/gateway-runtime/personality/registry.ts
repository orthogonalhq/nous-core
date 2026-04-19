/**
 * Personality trait registry (WR-128 / SP 1.2).
 *
 * Canonical home for the trait definition shape, the `defineTrait` factory,
 * the ordered `TRAIT_REGISTRY` tuple, and the derived `TraitAxes` type.
 *
 * The registry is the generative surface: `TraitAxes` is derived from
 * `TRAIT_REGISTRY`'s `as const` narrowness so that adding a new trait axis is
 * a single-file edit (mirrors SP 1.1's `defineWizardStep` pattern).
 *
 * Invariants (enforced by `__tests__/gateway-runtime/personality/registry.test.ts`):
 *   - Tuple order is load-bearing: identity / outputContract fragment
 *     concatenation iterates this array in declared order.
 *   - Every trait's "baseline" variant (`standard` / `compliant` / `concise`)
 *     has `injection: null`. This is the registry-level invariant that makes
 *     `{ preset: 'balanced' }` a byte-identity no-op at the identity surface.
 */

// ── Shape types ──────────────────────────────────────────────────────

/**
 * Where a trait value's prompt fragment is directed.
 *   - `identity`:       self-presentation guidance concatenated into the
 *                       agent's identity block.
 *   - `outputContract`: task-output guidance. Under the SDS § 0 Note 1
 *                       resolution (Option a, ADR 017), these fragments also
 *                       surface via the identity block at the
 *                       `resolveAgentProfile` boundary — the `target` field
 *                       preserves the intent-level distinction so a future
 *                       refactor can split them back out.
 */
export type TraitInjection =
  | { readonly target: 'identity' | 'outputContract'; readonly fragment: string }
  | null;

export interface TraitValueDefinition {
  readonly label: string;
  readonly description: string;
  readonly injection: TraitInjection;
}

export interface TraitDefinition<
  TId extends string = string,
  TValues extends Record<string, TraitValueDefinition> = Record<string, TraitValueDefinition>,
> {
  readonly id: TId;
  readonly label: string;
  readonly description: string;
  readonly default: keyof TValues & string;
  readonly values: TValues;
}

// ── Factory ──────────────────────────────────────────────────────────

/**
 * Identity function typed as a generic inferrer. Pure type-level helper —
 * no runtime transformation. `const` generics preserve the literal-type
 * narrowness of trait ids and value keys so `TraitAxes` (below) can be
 * derived precisely from the registry. Mirrors SP 1.1's `defineWizardStep`
 * precedent (SDS § 3.2.2, Note 3).
 */
export function defineTrait<
  const TId extends string,
  const TValues extends Record<string, TraitValueDefinition>,
>(spec: {
  readonly id: TId;
  readonly label: string;
  readonly description: string;
  readonly default: keyof TValues & string;
  readonly values: TValues;
}): TraitDefinition<TId, TValues> {
  return spec as TraitDefinition<TId, TValues>;
}

// ── Trait imports (tuple order is load-bearing) ──────────────────────

import { thoroughnessTrait } from './traits/thoroughness.js';
import { initiativeTrait } from './traits/initiative.js';
import { candorTrait } from './traits/candor.js';
import { communicationStyleTrait } from './traits/communication-style.js';
import { codeStyleTrait } from './traits/code-style.js';

export const TRAIT_REGISTRY = [
  thoroughnessTrait,
  initiativeTrait,
  candorTrait,
  communicationStyleTrait,
  codeStyleTrait,
] as const;

/**
 * Derived trait-axes type: `{ [traitId]: traitValueKey }` with literal types
 * for each axis's value union. Collapse to `{ [id: string]: string }` is a
 * build-time regression — SDS I5 / I6 / F1.
 */
export type TraitAxes = {
  -readonly [T in typeof TRAIT_REGISTRY[number] as T['id']]: keyof T['values'] & string;
};
