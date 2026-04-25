/**
 * Checkpoint manager behavior tests.
 *
 * Phase 5.4 — Failure-Recovery Checkpoint, Retry, and Resume Governance.
 */
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { InMemoryRecoveryLedgerStore } from '../../recovery/recovery-ledger-store.js';
import { CheckpointManager } from '../../recovery/checkpoint-manager.js';

const RUN_ID = '550e8400-e29b-41d4-a716-446655440000';
const PROJECT_ID = '660e8400-e29b-41d4-a716-446655440001';
const HASH = 'a'.repeat(64);

function makeTmpDir(): string {
  return join(tmpdir(), 'nous-recovery-test', randomUUID());
}

describe('CheckpointManager', () => {
  it('prepare() writes prepare record and returns checkpoint_id', async () => {
    const ledger = new InMemoryRecoveryLedgerStore();
    const manager = new CheckpointManager(ledger, {
      dir: makeTmpDir(),
      triggerPolicy: 'node-boundary',
    });
    const result = await manager.prepare(RUN_ID, PROJECT_ID, {
      domain_scope: 'step_domain',
      state_vector_hash: HASH,
      policy_epoch: 'e1',
      scheduler_cursor: 'c1',
      tool_side_effect_journal_hwm: 0,
      memory_write_journal_hwm: 0,
      idempotency_key_set_hash: HASH,
    });
    expect(result.success).toBe(true);
    expect(result.checkpoint_id).toBeDefined();
  });

  it('getLastCommitted returns null when no committed checkpoint', async () => {
    const ledger = new InMemoryRecoveryLedgerStore();
    const manager = new CheckpointManager(ledger, {
      dir: makeTmpDir(),
      triggerPolicy: 'node-boundary',
    });
    await manager.prepare(RUN_ID, PROJECT_ID, {
      domain_scope: 'step_domain',
      state_vector_hash: HASH,
      policy_epoch: 'e1',
      scheduler_cursor: 'c1',
      tool_side_effect_journal_hwm: 0,
      memory_write_journal_hwm: 0,
      idempotency_key_set_hash: HASH,
    });
    const last = await manager.getLastCommitted(RUN_ID);
    expect(last).toBeNull();
  });

  it('commit() makes checkpoint resumable', async () => {
    const ledger = new InMemoryRecoveryLedgerStore();
    const manager = new CheckpointManager(ledger, {
      dir: makeTmpDir(),
      triggerPolicy: 'node-boundary',
    });
    const prep = await manager.prepare(RUN_ID, PROJECT_ID, {
      domain_scope: 'step_domain',
      state_vector_hash: HASH,
      policy_epoch: 'e1',
      scheduler_cursor: 'c1',
      tool_side_effect_journal_hwm: 0,
      memory_write_journal_hwm: 0,
      idempotency_key_set_hash: HASH,
    });
    expect(prep.success).toBe(true);
    const commitResult = await manager.commit(
      RUN_ID,
      prep.checkpoint_id!,
      'witness-ref',
    );
    expect(commitResult.success).toBe(true);
    const last = await manager.getLastCommitted(RUN_ID);
    expect(last).toBeTruthy();
    expect(last!.committed_at).toBeTruthy();
  });

  it('validateChain() returns valid for single checkpoint', async () => {
    const ledger = new InMemoryRecoveryLedgerStore();
    const manager = new CheckpointManager(ledger, {
      dir: makeTmpDir(),
      triggerPolicy: 'node-boundary',
    });
    await manager.prepare(RUN_ID, PROJECT_ID, {
      domain_scope: 'step_domain',
      state_vector_hash: HASH,
      policy_epoch: 'e1',
      scheduler_cursor: 'c1',
      tool_side_effect_journal_hwm: 0,
      memory_write_journal_hwm: 0,
      idempotency_key_set_hash: HASH,
    });
    const prep = await manager.prepare(RUN_ID, PROJECT_ID, {
      domain_scope: 'step_domain',
      state_vector_hash: 'b'.repeat(64),
      policy_epoch: 'e1',
      scheduler_cursor: 'c1',
      tool_side_effect_journal_hwm: 0,
      memory_write_journal_hwm: 0,
      idempotency_key_set_hash: HASH,
    });
    await manager.commit(RUN_ID, prep.checkpoint_id!, 'w1');
    const chain = await manager.validateChain(RUN_ID);
    expect(chain.valid).toBe(true);
  });
});
