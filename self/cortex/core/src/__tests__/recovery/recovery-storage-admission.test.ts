/**
 * Closed-enum admission tests for SP 9 storage emission literals.
 *
 * WR-162 SP 9 — D1-style closed-enum admission discipline (SUPV-SP9-017 +
 * SUPV-SP9-020 + SDS § D1-style admission table). Mirrors SP 8 UT-SP8-CAT1 /
 * UT-SP8-CAT2 happy-path discipline. Asserts that every closed-enum literal
 * SP 9 emits is admitted by the post-SP-8 schemas in `@nous/shared` — zero
 * schema widening required for SP 9.
 */
import { describe, it, expect } from 'vitest';
import {
  InvariantCodeSchema,
  RecoveryEventTypeSchema,
  CriticalActionCategorySchema,
  WitnessActorSchema,
} from '@nous/shared';

describe('SP 9 closed-enum admission (D1-style discipline)', () => {
  it('UT-SP9-CAT1 — InvariantCodeSchema admits "RECOVERY-SEAL"', () => {
    expect(InvariantCodeSchema.safeParse('RECOVERY-SEAL').success).toBe(true);
  });

  it('UT-SP9-CAT2 — InvariantCodeSchema admits "RECOVERY-CORRUPT"', () => {
    expect(InvariantCodeSchema.safeParse('RECOVERY-CORRUPT').success).toBe(true);
  });

  it('UT-SP9-CAT3 — RecoveryEventTypeSchema admits "fr_recovery_witness_emitted"', () => {
    expect(
      RecoveryEventTypeSchema.safeParse('fr_recovery_witness_emitted').success,
    ).toBe(true);
  });

  it('UT-SP9-CAT4 — CriticalActionCategorySchema admits "recovery-evidence" (SP 8 SUPV-SP8-002 carry-forward)', () => {
    expect(
      CriticalActionCategorySchema.safeParse('recovery-evidence').success,
    ).toBe(true);
  });

  it('UT-SP9-CAT5 — WitnessActorSchema admits "system" (SP 9 emits with this actor literal)', () => {
    expect(WitnessActorSchema.safeParse('system').success).toBe(true);
  });
});
