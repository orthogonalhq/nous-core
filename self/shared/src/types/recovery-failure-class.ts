/**
 * Failure class taxonomy for Nous-OSS recovery.
 *
 * Phase 5.4 — Failure-Recovery Checkpoint, Retry, and Resume Governance.
 * Canonical source: failure-recovery-architecture-v1.md
 */
import { z } from 'zod';

export const RecoveryFailureClassSchema = z.enum([
  'retryable_transient',
  'non_retryable_deterministic',
  'policy_or_invariant_violation',
  'unknown_external_effect',
]);
export type RecoveryFailureClass = z.infer<typeof RecoveryFailureClassSchema>;
