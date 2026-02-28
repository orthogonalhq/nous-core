/**
 * Recovery ledger store behavior tests.
 *
 * Phase 5.4 — Failure-Recovery Checkpoint, Retry, and Resume Governance.
 */
import { describe, it, expect } from 'vitest';
import { InMemoryRecoveryLedgerStore } from '../../recovery/recovery-ledger-store.js';

const RUN_ID = '550e8400-e29b-41d4-a716-446655440000';
const PROJECT_ID = '660e8400-e29b-41d4-a716-446655440001';
const HASH = 'a'.repeat(64);
const NOW = new Date().toISOString();

describe('InMemoryRecoveryLedgerStore', () => {
  it('append() succeeds and returns segment_id and sequence', async () => {
    const store = new InMemoryRecoveryLedgerStore();
    const result = await store.append({
      event_type: 'fr_recovery_started',
      run_id: RUN_ID,
      project_id: PROJECT_ID,
      domain_scope: 'step_domain',
      payload_hash: HASH,
      prev_event_hash: null,
      occurred_at: NOW,
    });
    expect(result.success).toBe(true);
    expect(result.segment_id).toBeDefined();
    expect(result.sequence).toBe(1);
  });

  it('seal() succeeds with witnessRef', async () => {
    const store = new InMemoryRecoveryLedgerStore();
    const first = await store.append({
      event_type: 'fr_recovery_started',
      run_id: RUN_ID,
      project_id: PROJECT_ID,
      domain_scope: 'step_domain',
      payload_hash: HASH,
      prev_event_hash: null,
      occurred_at: NOW,
    });
    await store.append({
      event_type: 'fr_crash_detected',
      run_id: RUN_ID,
      project_id: PROJECT_ID,
      domain_scope: 'step_domain',
      payload_hash: 'b'.repeat(64),
      prev_event_hash: HASH,
      occurred_at: NOW,
    });
    const segmentId = first.segment_id!;
    const sealResult = await store.seal(segmentId!, 'witness-ref-1');
    expect(sealResult.success).toBe(true);
    const last = await store.getLastSegment();
    expect(last).toBeTruthy();
    expect(last!.sealed_at).toBeTruthy();
  });

  it('getCheckpoints returns only committed', async () => {
    const store = new InMemoryRecoveryLedgerStore();
    await store.appendCheckpoint(
      {
        checkpoint_id: '550e8400-e29b-41d4-a716-446655440010',
        run_id: RUN_ID,
        project_id: PROJECT_ID,
        domain_scope: 'step_domain',
        state_vector_hash: HASH,
        policy_epoch: 'e1',
        scheduler_cursor: 'c1',
        tool_side_effect_journal_hwm: 0,
        memory_write_journal_hwm: 0,
        idempotency_key_set_hash: HASH,
        checkpoint_prev_hash: null,
        created_at: NOW,
        committed_at: null,
        witness_checkpoint_ref: null,
      },
      false,
    );
    const checkpoints = await store.getCheckpoints(RUN_ID);
    expect(checkpoints).toHaveLength(0);
    await store.appendCheckpoint(
      {
        checkpoint_id: '550e8400-e29b-41d4-a716-446655440011',
        run_id: RUN_ID,
        project_id: PROJECT_ID,
        domain_scope: 'step_domain',
        state_vector_hash: HASH,
        policy_epoch: 'e1',
        scheduler_cursor: 'c1',
        tool_side_effect_journal_hwm: 0,
        memory_write_journal_hwm: 0,
        idempotency_key_set_hash: HASH,
        checkpoint_prev_hash: null,
        created_at: NOW,
        committed_at: NOW,
        witness_checkpoint_ref: 'w1',
      },
      true,
    );
    const committed = await store.getCheckpoints(RUN_ID);
    expect(committed).toHaveLength(1);
  });
});
