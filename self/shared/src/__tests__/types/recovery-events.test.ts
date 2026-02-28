/**
 * Recovery evidence event types contract tests.
 *
 * Phase 5.4 — Failure-Recovery Checkpoint, Retry, and Resume Governance.
 */
import { describe, it, expect } from 'vitest';
import { RecoveryEvidenceEventTypeSchema } from '../../types/recovery-events.js';

describe('RecoveryEvidenceEventTypeSchema', () => {
  it('accepts all 22 event types', () => {
    const types = [
      'fr_crash_detected',
      'fr_recovery_started',
      'fr_checkpoint_prepare_written',
      'fr_checkpoint_committed',
      'fr_checkpoint_prepare_aborted',
      'fr_ledger_segment_rotated',
      'fr_ledger_segment_sealed',
      'fr_retry_scheduled',
      'fr_retry_attempted',
      'fr_retry_exhausted',
      'fr_retry_blocked',
      'fr_rollback_applied',
      'fr_rollback_blocked',
      'fr_compensation_applied',
      'fr_compensation_failed',
      'fr_unknown_external_effect_flagged',
      'fr_resume_authorized',
      'fr_resume_blocked',
      'fr_recovery_completed',
      'fr_recovery_blocked_review_required',
      'fr_recovery_failed_hard_stop',
      'fr_recovery_integrity_mismatch_detected',
    ];
    for (const t of types) {
      expect(RecoveryEvidenceEventTypeSchema.safeParse(t).success).toBe(true);
    }
  });

  it('rejects invalid event type', () => {
    expect(RecoveryEvidenceEventTypeSchema.safeParse('invalid').success).toBe(
      false,
    );
  });
});
