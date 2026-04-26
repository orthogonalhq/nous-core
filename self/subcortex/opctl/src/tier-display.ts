/**
 * Tier-display module — pure presentation metadata for confirmation tiers.
 *
 * WR-162 SP 14 (SUPV-SP14-021): Extracted from confirmation.ts to provide a
 * renderer-safe import path with ZERO `node:*` imports. The package barrel
 * (`index.ts`) re-exports the four pure helpers from this module so
 * consumer-side `import { getRequiredTier } from '@nous/subcortex-opctl'`
 * resolves through the barrel to `tier-display.ts` first — the renderer-shim
 * `createHash` path in `confirmation.ts` is NOT exercised post-extraction.
 *
 * SUPV-SP10-007 + SC-15 zero-diff is RELAXED at SP 14 for self/subcortex/opctl
 * specifically — the only modify cell at SP 14 in self/subcortex.
 */
import type { ConfirmationTier, ControlAction } from '@nous/shared';

/**
 * Presentation metadata for a confirmation tier — drives tier-display UI
 * (severity pill, rationale copy, T3 cooldown). Per Decision #9 § 9c.
 */
export type ConfirmationTierDisplay = {
  level: ConfirmationTier;
  label: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  rationaleKey: string;
  /** Present on T3 only. */
  cooldownMs?: number;
};

/**
 * T3 cooldown duration, in milliseconds. V1 value is `0` (no cooldown wired);
 * SP 7 promotes this to the policy-configured value.
 */
export const T3_COOLDOWN_MS = 0;

/**
 * Returns required confirmation tier for action. Per operator-control-architecture-v1.
 */
export function getRequiredTier(action: ControlAction): ConfirmationTier {
  if (action === 'hard_stop' || action === 'resume') return 'T3';
  if (action === 'cancel' || action === 'revert_to_previous_state' || action === 'edit_submitted_prompt') return 'T2';
  if (action === 'pause' || action === 'stop_response' || action === 'retry_step') return 'T1';
  return 'T0';
}

/**
 * Returns presentation metadata for a confirmation tier. Per Decision #9 § 9c.
 *
 * WR-162 SP 7 replaces the SP 2 stub body with the 4-arm exhaustive switch.
 * `ConfirmationTier` is a closed Zod enum (`'T0' | 'T1' | 'T2' | 'T3'`);
 * TypeScript exhaustiveness covers all four arms at compile time — a future
 * `'T4'` widening of `ConfirmationTierSchema` surfaces as a compile-time
 * exhaustiveness error at this switch (the correct contract-defect surface).
 */
export function getTierDisplay(
  tier: ConfirmationTier,
): ConfirmationTierDisplay {
  switch (tier) {
    case 'T0':
      return {
        level: 'T0',
        label: 'Immediate',
        severity: 'low',
        rationaleKey: 'tier.t0.rationale',
      };
    case 'T1':
      return {
        level: 'T1',
        label: 'Confirmation',
        severity: 'medium',
        rationaleKey: 'tier.t1.rationale',
      };
    case 'T2':
      return {
        level: 'T2',
        label: 'Two-step',
        severity: 'high',
        rationaleKey: 'tier.t2.rationale',
      };
    case 'T3':
      return {
        level: 'T3',
        label: 'Cooldown-gated',
        severity: 'critical',
        rationaleKey: 'tier.t3.rationale',
        cooldownMs: T3_COOLDOWN_MS,
      };
  }
}
