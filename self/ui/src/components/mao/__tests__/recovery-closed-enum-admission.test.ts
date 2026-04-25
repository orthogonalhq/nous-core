// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  ConfirmationTierSchema,
  ControlActionSchema,
  CriticalActionCategorySchema,
  RecoveryEventTypeSchema,
  RecoveryTerminalStateSchema,
} from '@nous/shared';

/**
 * UT-SP10-CAT* — D1-style closed-enum admission regression guards.
 *
 * Per SDS § Invariants SUPV-SP10-006 + § D1-style admission table + Goals
 * SC-22. Each test asserts that an upstream-ratified literal SP 10 routes
 * through remains admitted — a future contract narrowing surfaces here as a
 * test failure rather than as a runtime/typecheck-time surprise.
 *
 * Mirrors SP 8 UT-SP8-CAT* + SP 9 UT-SP9-CAT* happy-path discipline.
 */
describe('SP 10 closed-enum admission regression guards', () => {
  it('UT-SP10-CAT1 — RecoveryTerminalState admits the three SP 10 literals', () => {
    expect(
      RecoveryTerminalStateSchema.safeParse('recovery_completed').success,
    ).toBe(true);
    expect(
      RecoveryTerminalStateSchema.safeParse('recovery_blocked_review_required')
        .success,
    ).toBe(true);
    expect(
      RecoveryTerminalStateSchema.safeParse('recovery_failed_hard_stop').success,
    ).toBe(true);
  });

  it('UT-SP10-CAT2 — ConfirmationTier admits all four literals', () => {
    expect(ConfirmationTierSchema.safeParse('T0').success).toBe(true);
    expect(ConfirmationTierSchema.safeParse('T1').success).toBe(true);
    expect(ConfirmationTierSchema.safeParse('T2').success).toBe(true);
    expect(ConfirmationTierSchema.safeParse('T3').success).toBe(true);
  });

  it('UT-SP10-CAT3 — ControlAction admits the three SP 10 literals', () => {
    expect(ControlActionSchema.safeParse('resume').success).toBe(true);
    expect(ControlActionSchema.safeParse('cancel').success).toBe(true);
    expect(ControlActionSchema.safeParse('revert').success).toBe(true);
  });

  it('UT-SP10-CAT4 — CriticalActionCategory admits recovery-evidence', () => {
    expect(
      CriticalActionCategorySchema.safeParse('recovery-evidence').success,
    ).toBe(true);
  });

  it('UT-SP10-CAT5 — RecoveryEventType admits fr_recovery_witness_emitted', () => {
    expect(
      RecoveryEventTypeSchema.safeParse('fr_recovery_witness_emitted').success,
    ).toBe(true);
  });
});
