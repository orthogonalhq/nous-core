/**
 * Recovery operation class schema contract tests.
 *
 * Phase 5.4 — Failure-Recovery Checkpoint, Retry, and Resume Governance.
 */
import { describe, it, expect } from 'vitest';
import { RecoveryOperationClassSchema } from '../../types/recovery-operation-class.js';

describe('RecoveryOperationClassSchema', () => {
  it('accepts all operation class values', () => {
    expect(
      RecoveryOperationClassSchema.safeParse('reversible').success,
    ).toBe(true);
    expect(
      RecoveryOperationClassSchema.safeParse('compensatable').success,
    ).toBe(true);
    expect(
      RecoveryOperationClassSchema.safeParse('irreversible').success,
    ).toBe(true);
  });

  it('rejects invalid operation class', () => {
    expect(RecoveryOperationClassSchema.safeParse('invalid').success).toBe(
      false,
    );
  });
});
