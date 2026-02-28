/**
 * Recovery terminal state schema contract tests.
 *
 * Phase 5.4 — Failure-Recovery Checkpoint, Retry, and Resume Governance.
 */
import { describe, it, expect } from 'vitest';
import { RecoveryTerminalStateSchema } from '../../types/recovery-terminal-state.js';

describe('RecoveryTerminalStateSchema', () => {
  it('accepts all terminal state values', () => {
    expect(
      RecoveryTerminalStateSchema.safeParse('recovery_completed').success,
    ).toBe(true);
    expect(
      RecoveryTerminalStateSchema.safeParse(
        'recovery_blocked_review_required',
      ).success,
    ).toBe(true);
    expect(
      RecoveryTerminalStateSchema.safeParse('recovery_failed_hard_stop').success,
    ).toBe(true);
  });

  it('rejects invalid terminal state', () => {
    expect(RecoveryTerminalStateSchema.safeParse('invalid').success).toBe(
      false,
    );
  });
});
