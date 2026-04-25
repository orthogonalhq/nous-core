/**
 * T2 floor for recovery-UX-surface state-changing affordances.
 *
 * Per Decision #9 §9c "T2 floor layering": the floor composes at the recovery-UX
 * call site, never inside `getRequiredTier`. T0/T1 inherent tiers are floored to
 * T2; T2/T3 inherent tiers pass through unchanged.
 *
 * Closed-form (T → T) mapping. Pure function. No closure capture; no React hook;
 * no side effect. NOT re-exported from `@nous/subcortex-opctl` per Decision #9
 * §9c (the floor is a recovery-UX concern, not an opctl concern).
 *
 * WR-162 SP 10 — see `.worklog/sprints/feat/system-observability-and-control/
 * phase-1/phase-1.10/sds.mdx` § Invariants SUPV-SP10-004 / SUPV-SP10-010.
 */
import type { ConfirmationTier } from '@nous/shared';

export function applyRecoveryTierFloor(
  tier: ConfirmationTier,
): ConfirmationTier {
  return tier === 'T0' || tier === 'T1' ? 'T2' : tier;
}
