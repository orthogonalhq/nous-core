/**
 * Recovery ledger segment schema for Nous-OSS.
 *
 * Phase 5.4 — Failure-Recovery Checkpoint, Retry, and Resume Governance.
 * Canonical source: failure-recovery-architecture-v1.md
 */
import { z } from 'zod';

/** Regex for 64-char lowercase hex (SHA-256). */
export const RECOVERY_HASH_REGEX = /^[a-f0-9]{64}$/;

export const RecoverySegmentSchema = z.object({
  segment_id: z.string().uuid(),
  segment_seq_start: z.number().int().nonnegative(),
  segment_seq_end: z.number().int().nonnegative(),
  prev_segment_hash: z.string().regex(RECOVERY_HASH_REGEX).nullable(),
  segment_hash: z.string().regex(RECOVERY_HASH_REGEX),
  sealed_at: z.string().datetime().nullable(),
});
export type RecoverySegment = z.infer<typeof RecoverySegmentSchema>;
