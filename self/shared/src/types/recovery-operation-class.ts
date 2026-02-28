/**
 * Operation class for rollback semantics in Nous-OSS recovery.
 *
 * Phase 5.4 — Failure-Recovery Checkpoint, Retry, and Resume Governance.
 * Canonical source: failure-recovery-architecture-v1.md
 */
import { z } from 'zod';

export const RecoveryOperationClassSchema = z.enum([
  'reversible',
  'compensatable',
  'irreversible',
]);
export type RecoveryOperationClass = z.infer<
  typeof RecoveryOperationClassSchema
>;
