/**
 * Recovery flow integration test.
 *
 * Phase 5.4 — Failure-Recovery Checkpoint, Retry, and Resume Governance.
 */
import { describe, it, expect } from 'vitest';
import { InMemoryRecoveryLedgerStore } from '../../recovery/recovery-ledger-store.js';
import { CheckpointManager } from '../../recovery/checkpoint-manager.js';
import { RetryPolicyEvaluator } from '../../recovery/retry-policy-evaluator.js';
import { RollbackPolicyEvaluator } from '../../recovery/rollback-policy-evaluator.js';
import { RecoveryOrchestrator } from '../../recovery/recovery-orchestrator.js';

const RUN_ID = '550e8400-e29b-41d4-a716-446655440000';
const PROJECT_ID = '660e8400-e29b-41d4-a716-446655440001';
const HASH = 'a'.repeat(64);

describe('Recovery flow integration', () => {
  it('end-to-end: prepare → commit → orchestrate → recovery_completed', async () => {
    const ledger = new InMemoryRecoveryLedgerStore();
    const manager = new CheckpointManager(ledger);
    const retryEvaluator = new RetryPolicyEvaluator();
    const rollbackEvaluator = new RollbackPolicyEvaluator();
    const orchestrator = new RecoveryOrchestrator();

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

    const terminalState = await orchestrator.run({
      run_id: RUN_ID,
      project_id: PROJECT_ID,
      failure_class: 'retryable_transient',
      ledger_store: ledger,
      checkpoint_manager: manager,
      retry_evaluator: retryEvaluator,
      rollback_evaluator: rollbackEvaluator,
    });
    expect(terminalState).toBe('recovery_completed');
  });

  it('end-to-end: no checkpoint → recovery_failed_hard_stop', async () => {
    const ledger = new InMemoryRecoveryLedgerStore();
    const manager = new CheckpointManager(ledger);
    const orchestrator = new RecoveryOrchestrator();

    const terminalState = await orchestrator.run({
      run_id: RUN_ID,
      project_id: PROJECT_ID,
      failure_class: 'retryable_transient',
      ledger_store: ledger,
      checkpoint_manager: manager,
      retry_evaluator: new RetryPolicyEvaluator(),
      rollback_evaluator: new RollbackPolicyEvaluator(),
    });
    expect(terminalState).toBe('recovery_failed_hard_stop');
  });
});
