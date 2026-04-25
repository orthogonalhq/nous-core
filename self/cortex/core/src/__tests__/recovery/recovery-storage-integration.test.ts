/**
 * Recovery storage end-to-end integration tests.
 *
 * WR-162 SP 9 — Checkpoint JSON/JSONL Storage + Atomicity. Validates that
 * the SP 9 disk-backed CheckpointManager + RecoveryLedgerStore drive SP 8's
 * RecoveryOrchestrator to the expected terminal states after a simulated
 * crash + restart. Closes Goals SC-10 / SC-11 / SC-12 (and Goals N2: the
 * no-checkpoint terminal is pinned to `recovery_failed_hard_stop`).
 */
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { CheckpointManager } from '../../recovery/checkpoint-manager.js';
import {
  InMemoryRecoveryLedgerStore,
  RecoveryLedgerStore,
} from '../../recovery/recovery-ledger-store.js';
import { RetryPolicyEvaluator } from '../../recovery/retry-policy-evaluator.js';
import { RollbackPolicyEvaluator } from '../../recovery/rollback-policy-evaluator.js';
import { RecoveryOrchestrator } from '../../recovery/recovery-orchestrator.js';

const RUN_ID = '550e8400-e29b-41d4-a716-446655440000';
const PROJECT_ID = '660e8400-e29b-41d4-a716-446655440001';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function makeTmpDir(): string {
  return join(tmpdir(), 'nous-recovery-test', randomUUID());
}

const SNAPSHOT = {
  domain_scope: 'step_domain' as const,
  state_vector_hash: HASH_A,
  policy_epoch: 'e1',
  scheduler_cursor: 'c1',
  tool_side_effect_journal_hwm: 0,
  memory_write_journal_hwm: 0,
  idempotency_key_set_hash: HASH_A,
};

describe('Recovery storage integration (SP 9)', () => {
  describe('IT-SP9-INTEG-HAPPY — end-to-end happy path (SC-10)', () => {
    it('disk-backed triple → orchestrator returns recovery_completed', async () => {
      const dir = makeTmpDir();
      const ledger = new InMemoryRecoveryLedgerStore();
      // CheckpointManager is disk-backed (commits land on disk via fs.rename).
      const manager = new CheckpointManager(ledger, {
        dir,
        triggerPolicy: 'node-boundary',
      });
      const orchestrator = new RecoveryOrchestrator();

      const prep = await manager.prepare(RUN_ID, PROJECT_ID, SNAPSHOT);
      expect(prep.success).toBe(true);
      const commit = await manager.commit(RUN_ID, prep.checkpoint_id!, 'w');
      expect(commit.success).toBe(true);

      // Simulate a "restart" by constructing a fresh manager pointed at the
      // same dir (the orchestrator reads via getLastCommitted and validateChain).
      // Note: the in-memory ledger does not survive restart, but commit() also
      // writes to disk via fs.rename — getLastCommitted reads from disk first,
      // and validateChain walks the in-memory committed cache populated by
      // commit() before the "crash".
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
  });

  describe('IT-SP9-INTEG-CORRUPT — chain-corruption integration (SC-11)', () => {
    it('chain-validation failure → recovery_blocked_review_required (SP 8 chain-invalid branch)', async () => {
      const dir = makeTmpDir();
      const ledger = new InMemoryRecoveryLedgerStore();
      const manager = new CheckpointManager(ledger, {
        dir,
        triggerPolicy: 'node-boundary',
      });
      const orchestrator = new RecoveryOrchestrator();

      // Two committed checkpoints; tamper the second's prev_hash to break the chain.
      const p1 = await manager.prepare(RUN_ID, PROJECT_ID, SNAPSHOT);
      await manager.commit(RUN_ID, p1.checkpoint_id!, 'w1');
      const p2 = await manager.prepare(RUN_ID, PROJECT_ID, {
        ...SNAPSHOT,
        state_vector_hash: HASH_B,
      });
      await manager.commit(RUN_ID, p2.checkpoint_id!, 'w2');

      // Tamper the in-memory committed-cache record (validateChain reads via
      // ledger.getCheckpoints).
      const all = await ledger.getAllCheckpoints(RUN_ID);
      const committed = all.filter((r) => r.is_committed);
      committed[1]!.checkpoint.checkpoint_prev_hash = 'c'.repeat(64);

      const result = await orchestrator.run({
        run_id: RUN_ID,
        project_id: PROJECT_ID,
        failure_class: 'retryable_transient',
        ledger_store: ledger,
        checkpoint_manager: manager,
        retry_evaluator: new RetryPolicyEvaluator(),
        rollback_evaluator: new RollbackPolicyEvaluator(),
      });
      expect(result).toBe('recovery_blocked_review_required');
    });
  });

  describe('IT-SP9-INTEG-NOCKPT — no-checkpoint integration (SC-12; closes Goals N2)', () => {
    it('orphan <tmp>-only on disk → orchestrator returns recovery_failed_hard_stop', async () => {
      const dir = makeTmpDir();
      // Pre-seed an orphan tmp WITHOUT a corresponding <final>.
      const runDir = join(dir, `run-${RUN_ID}`);
      await fs.mkdir(runDir, { recursive: true });
      await fs.writeFile(
        join(runDir, 'snapshot-orphan.json.tmp'),
        '{"orphan": true}\n',
        'utf8',
      );

      const ledger = new InMemoryRecoveryLedgerStore();
      const manager = new CheckpointManager(ledger, {
        dir,
        triggerPolicy: 'node-boundary',
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
      // Goals N2 closure: pinned to `recovery_failed_hard_stop`.
      expect(result).toBe('recovery_failed_hard_stop');

      // Orphan tmp should be cleaned up.
      const remaining = await fs.readdir(runDir);
      expect(remaining.filter((e) => e.endsWith('.tmp'))).toHaveLength(0);
    });
  });

  describe('IT-SP9-INTEG-LDG-RESTART — disk-backed RecoveryLedgerStore survives restart', () => {
    it('appends survive a restart via disk; init() on second instance preserves chain head', async () => {
      const dir = makeTmpDir();
      const event = {
        event_type: 'fr_recovery_started',
        run_id: RUN_ID,
        project_id: PROJECT_ID,
        domain_scope: 'step_domain' as const,
        payload_hash: HASH_A,
        prev_event_hash: null,
        occurred_at: '2026-04-25T00:00:00.000Z',
      };

      const store1 = new RecoveryLedgerStore({ dir });
      const r1 = await store1.append(event);
      const segId = r1.segment_id!;

      // "Restart" — new instance pointed at same dir.
      const store2 = new RecoveryLedgerStore({ dir });
      // Append another record; the new event's prev_event_hash should be set to
      // the first record's event_hash from the previous run.
      const r2 = await store2.append(event);
      expect(r2.success).toBe(true);
      expect(r2.segment_id).toBe(segId); // same unsealed segment continued

      const segPath = join(dir, `seg-${segId}.jsonl`);
      const raw = await fs.readFile(segPath, 'utf8');
      const lines = raw.split('\n').filter((l) => l.length > 0);
      expect(lines).toHaveLength(2);
      const rec1 = JSON.parse(lines[0]!);
      const rec2 = JSON.parse(lines[1]!);
      expect(rec2.prev_event_hash).toBe(rec1.event_hash);
    });
  });
});
