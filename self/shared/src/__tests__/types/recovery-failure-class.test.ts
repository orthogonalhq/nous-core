/**
 * Recovery failure class schema contract tests.
 *
 * Phase 5.4 — Failure-Recovery Checkpoint, Retry, and Resume Governance.
 */
import { describe, it, expect } from 'vitest';
import { RecoveryFailureClassSchema } from '../../types/recovery-failure-class.js';

describe('RecoveryFailureClassSchema', () => {
  it('accepts all failure class values', () => {
    expect(
      RecoveryFailureClassSchema.safeParse('retryable_transient').success,
    ).toBe(true);
    expect(
      RecoveryFailureClassSchema.safeParse('non_retryable_deterministic')
        .success,
    ).toBe(true);
    expect(
      RecoveryFailureClassSchema.safeParse('policy_or_invariant_violation')
        .success,
    ).toBe(true);
    expect(
      RecoveryFailureClassSchema.safeParse('unknown_external_effect').success,
    ).toBe(true);
  });

  it('rejects invalid failure class', () => {
    expect(RecoveryFailureClassSchema.safeParse('invalid').success).toBe(false);
  });
});
