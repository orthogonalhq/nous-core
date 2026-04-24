/**
 * WR-162 SP 4 — Supervisor ↔ Witnessd enforcement-action domain translator.
 *
 * SDS § Invariants SUPV-SP4-011 (B1 resolution). Two enforcement-action
 * enums co-exist:
 *   - Supervisor domain: `'hard_stop' | 'auto_pause' | 'require_review' | 'warn'`
 *     (snake_case, in `self/shared/src/types/supervisor.ts`).
 *   - Witnessd domain:  `'hard-stop' | 'auto-pause' | 'review'`
 *     (kebab-case, in `self/shared/src/types/evidence.ts`).
 *
 * The seam between them is the supervisor service's interaction with
 * witnessd's `InvariantEnforcementDecision` shape. SP 4 keeps both enums
 * authoritative in their respective domains and lands this translator as
 * the single reconciliation site. SP 4 classifier itself consumes the
 * supervisor domain directly (`SUPERVISOR_INVARIANT_SEVERITY_MAP`); the
 * translator is used where cross-domain comparisons are required (e.g.,
 * tests that compare witnessd mapping to supervisor mapping; SP 5 sites
 * that read a witnessd decision and hand it to an `onEnforcementDispatch`
 * callback that expects the supervisor domain).
 *
 * SP 6 deferral: `'warn'` does NOT round-trip in SP 4 — it is not
 * representable in `EnforcementActionSchema` (witnessd kebab-case). SP 6
 * widens the witnessd schema and maps `'warn' → 'warn'`.
 */
import type {
  EnforcementAction,
  SupervisorEnforcementAction,
} from '@nous/shared';

/**
 * Narrow SP-4 supervisor subset. SUP-001..SUP-008 map only to
 * `hard_stop` / `auto_pause`; `require_review` and `warn` are reserved
 * for SP 5 / SP 6 consumers.
 */
export type SupervisorEnforcementActionSP4 = Extract<
  SupervisorEnforcementAction,
  'hard_stop' | 'auto_pause'
>;

/**
 * Supervisor (snake) → Witnessd (kebab). Exhaustive over the supervisor
 * enum. Throws on `'warn'` with an explicit SP-6 deferral message —
 * `'warn'` is not produced by any SP 4 classifier path, so this branch
 * is unreachable in SP 4 production (lockable by `UT-TR1`).
 */
export function toWitnessdEnforcement(
  a: SupervisorEnforcementAction,
): EnforcementAction {
  switch (a) {
    case 'hard_stop':
      return 'hard-stop';
    case 'auto_pause':
      return 'auto-pause';
    case 'require_review':
      return 'review';
    case 'warn':
      // WR-162 SP 6 (SUPV-SP6-009) — widened `EnforcementActionSchema` to
      // include `'warn'`; the SP 4 deferral branch (throw) is closed.
      return 'warn';
    default: {
      // Compile-time exhaustiveness check. If a future supervisor enum
      // value lands without updating this switch, TypeScript flags it
      // here via the `never` assignment.
      const _exhaustive: never = a;
      throw new Error(
        `toWitnessdEnforcement: unknown supervisor enforcement action ${String(
          _exhaustive,
        )}`,
      );
    }
  }
}

/**
 * Witnessd (kebab) → Supervisor (snake). Reverse direction. WR-162 SP 6
 * (SUPV-SP6-009) widened witnessd's `EnforcementActionSchema` to include
 * `'warn'`; mapping to supervisor-domain `'warn'` is now symmetric.
 */
export function fromWitnessdEnforcement(
  a: EnforcementAction,
): SupervisorEnforcementAction {
  switch (a) {
    case 'hard-stop':
      return 'hard_stop';
    case 'auto-pause':
      return 'auto_pause';
    case 'review':
      return 'require_review';
    case 'warn':
      return 'warn';
    default: {
      const _exhaustive: never = a;
      throw new Error(
        `fromWitnessdEnforcement: unknown witnessd enforcement action ${String(
          _exhaustive,
        )}`,
      );
    }
  }
}
