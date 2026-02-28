/**
 * Recovery checkpoint schema contract tests.
 *
 * Phase 5.4 — Failure-Recovery Checkpoint, Retry, and Resume Governance.
 */
import { describe, it, expect } from 'vitest';
import { RecoveryCheckpointSchema } from '../../types/recovery-checkpoint.js';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const HASH = 'a'.repeat(64);
const NOW = new Date().toISOString();

describe('RecoveryCheckpointSchema', () => {
  const validCheckpoint = {
    checkpoint_id: UUID,
    run_id: UUID,
    project_id: UUID,
    domain_scope: 'step_domain' as const,
    state_vector_hash: HASH,
    policy_epoch: 'epoch-1',
    scheduler_cursor: 'cursor-1',
    tool_side_effect_journal_hwm: 0,
    memory_write_journal_hwm: 0,
    idempotency_key_set_hash: HASH,
    checkpoint_prev_hash: null,
    created_at: NOW,
    committed_at: NOW,
    witness_checkpoint_ref: 'witness-ref-1',
  };

  it('parses valid checkpoint with all required fields', () => {
    const result = RecoveryCheckpointSchema.safeParse(validCheckpoint);
    expect(result.success).toBe(true);
  });

  it('accepts committed_at null (prepare-only)', () => {
    const result = RecoveryCheckpointSchema.safeParse({
      ...validCheckpoint,
      committed_at: null,
      witness_checkpoint_ref: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid state_vector_hash', () => {
    const result = RecoveryCheckpointSchema.safeParse({
      ...validCheckpoint,
      state_vector_hash: 'invalid',
    });
    expect(result.success).toBe(false);
  });
});
