/**
 * Recovery orchestrator behavior tests.
 *
 * Phase 5.4 — Failure-Recovery Checkpoint, Retry, and Resume Governance.
 */
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { InMemoryRecoveryLedgerStore } from '../../recovery/recovery-ledger-store.js';
import { CheckpointManager } from '../../recovery/checkpoint-manager.js';
import { RetryPolicyEvaluator } from '../../recovery/retry-policy-evaluator.js';
import { RollbackPolicyEvaluator } from '../../recovery/rollback-policy-evaluator.js';
import { RecoveryOrchestrator } from '../../recovery/recovery-orchestrator.js';

const RUN_ID = '550e8400-e29b-41d4-a716-446655440000';
const PROJECT_ID = '660e8400-e29b-41d4-a716-446655440001';
const HASH = 'a'.repeat(64);

function makeTmpDir(): string {
  return join(tmpdir(), 'nous-recovery-test', randomUUID());
}

describe('RecoveryOrchestrator', () => {
  it('returns recovery_completed when chain valid and retry/rollback allowed', async () => {
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
    await manager.commit(RUN_ID, prep.checkpoint_id!, 'w1');

    const orchestrator = new RecoveryOrchestrator();
    const result = await orchestrator.run({
      run_id: RUN_ID,
      project_id: PROJECT_ID,
      failure_class: 'retryable_transient',
      ledger_store: ledger,
      checkpoint_manager: manager,
      retry_evaluator: new RetryPolicyEvaluator(),
      rollback_evaluator: new RollbackPolicyEvaluator(),
    });
    expect(result).toBe('recovery_completed');
  });

  // SP 8 D5 doc-fix opportunity (Goals N4 + IP § Boundary notes N5): the
  // pre-SP-9 description said "recovery_blocked_review_required" but the
  // assertion has always pinned to `recovery_failed_hard_stop` per
  // recovery-orchestrator.ts:76–82 (no-checkpoint path). SP 9 lockstep-updates
  // the constructor call (CheckpointManagerDeps required arg), pulling this
  // file into scope; the doc-fix opportunity is honored in the same diff per
  // Goals N4 routing.
  it('returns recovery_failed_hard_stop when no committed checkpoint', async () => {
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

    const orchestrator = new RecoveryOrchestrator();
    const result = await orchestrator.run({
      run_id: RUN_ID,
      project_id: PROJECT_ID,
      failure_class: 'retryable_transient',
      ledger_store: ledger,
      checkpoint_manager: manager,
      retry_evaluator: new RetryPolicyEvaluator(),
      rollback_evaluator: new RollbackPolicyEvaluator(),
    });
    expect(result).toBe('recovery_failed_hard_stop');
  });
});
