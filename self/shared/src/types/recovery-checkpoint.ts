/**
 * Recovery checkpoint schema for Nous-OSS.
 *
 * Phase 5.4 — Failure-Recovery Checkpoint, Retry, and Resume Governance.
 * Canonical source: failure-recovery-architecture-v1.md
 */
import { z } from 'zod';
import { ProjectIdSchema } from './ids.js';
import { RecoveryDomainSchema } from './recovery-domain.js';
import { RECOVERY_HASH_REGEX } from './recovery-segment.js';

export const RecoveryCheckpointSchema = z.object({
  checkpoint_id: z.string().uuid(),
  run_id: z.string().uuid(),
  project_id: ProjectIdSchema,
  domain_scope: RecoveryDomainSchema,
  state_vector_hash: z.string().regex(RECOVERY_HASH_REGEX),
  policy_epoch: z.string().min(1),
  scheduler_cursor: z.string().min(1),
  tool_side_effect_journal_hwm: z.number().int().nonnegative(),
  memory_write_journal_hwm: z.number().int().nonnegative(),
  idempotency_key_set_hash: z.string().regex(RECOVERY_HASH_REGEX),
  checkpoint_prev_hash: z.string().regex(RECOVERY_HASH_REGEX).nullable(),
  created_at: z.string().datetime(),
  committed_at: z.string().datetime().nullable(),
  witness_checkpoint_ref: z.string().min(1).nullable(),
});
export type RecoveryCheckpoint = z.infer<typeof RecoveryCheckpointSchema>;
