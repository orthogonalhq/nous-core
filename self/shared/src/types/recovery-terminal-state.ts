/**
 * Recovery terminal state schema for Nous-OSS.
 *
 * Phase 5.4 — Failure-Recovery Checkpoint, Retry, and Resume Governance.
 * Canonical source: failure-recovery-architecture-v1.md
 */
import { z } from 'zod';

export const RecoveryTerminalStateSchema = z.enum([
  'recovery_completed',
  'recovery_blocked_review_required',
  'recovery_failed_hard_stop',
]);
export type RecoveryTerminalState = z.infer<
  typeof RecoveryTerminalStateSchema
>;
