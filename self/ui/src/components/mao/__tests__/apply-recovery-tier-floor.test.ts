// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { applyRecoveryTierFloor } from '../apply-recovery-tier-floor';

/**
 * UT-SP10-FLOOR-* — closed-form mapping exhaustiveness for the
 * recovery-UX T2 floor helper (Decision #9 §9c).
 *
 * Per SDS § Invariants SUPV-SP10-004 + SUPV-SP10-010 — one assertion per
 * `ConfirmationTier` literal verifies the closed-form mapping
 *   (T0 | T1) → T2; (T2 | T3) → identity.
 *
 * The four tests double as regression guards against an accidentally
 * introduced heuristic (e.g., a content-pattern matcher) — the per-literal
 * assertions verify pure structural mapping.
 */
describe('applyRecoveryTierFloor (SP 10 helper)', () => {
  it('UT-SP10-FLOOR-T0 — lifts T0 to T2', () => {
    expect(applyRecoveryTierFloor('T0')).toBe('T2');
  });

  it('UT-SP10-FLOOR-T1 — lifts T1 to T2', () => {
    expect(applyRecoveryTierFloor('T1')).toBe('T2');
  });

  it('UT-SP10-FLOOR-T2 — passes T2 through (no-op)', () => {
    expect(applyRecoveryTierFloor('T2')).toBe('T2');
  });

  it('UT-SP10-FLOOR-T3 — passes T3 through (no-op)', () => {
    expect(applyRecoveryTierFloor('T3')).toBe('T3');
  });
});
