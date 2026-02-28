/**
 * Two-phase checkpoint manager implementation.
 *
 * Phase 5.4 — Failure-Recovery Checkpoint, Retry, and Resume Governance.
 * Only committed checkpoints are resumable (FR-001).
 */
import { randomUUID } from 'node:crypto';
import type {
  IRecoveryLedgerStore,
  ICheckpointManager,
  CheckpointSnapshot,
  PrepareResult,
  CommitResult,
  ChainValidationResult,
} from '@nous/shared';
import {
  RecoveryCheckpointSchema,
  RECOVERY_HASH_REGEX,
} from '@nous/shared';

export class CheckpointManager implements ICheckpointManager {
  constructor(private readonly ledger: IRecoveryLedgerStore) {}

  async prepare(
    runId: string,
    projectId: string,
    snapshot: CheckpointSnapshot,
  ): Promise<PrepareResult> {
    const lastCommitted = await this.getLastCommitted(runId);
    const prevHash = lastCommitted?.state_vector_hash ?? null;
    const checkpointId = randomUUID();
    const now = new Date().toISOString();

    const checkpoint = RecoveryCheckpointSchema.parse({
      checkpoint_id: checkpointId,
      run_id: runId,
      project_id: projectId,
      domain_scope: snapshot.domain_scope,
      state_vector_hash: snapshot.state_vector_hash,
      policy_epoch: snapshot.policy_epoch,
      scheduler_cursor: snapshot.scheduler_cursor,
      tool_side_effect_journal_hwm: snapshot.tool_side_effect_journal_hwm,
      memory_write_journal_hwm: snapshot.memory_write_journal_hwm,
      idempotency_key_set_hash: snapshot.idempotency_key_set_hash,
      checkpoint_prev_hash: prevHash,
      created_at: now,
      committed_at: null,
      witness_checkpoint_ref: null,
    });

    await this.ledger.appendCheckpoint(checkpoint, false);
    return { success: true, checkpoint_id: checkpointId };
  }

  async commit(
    runId: string,
    checkpointId: string,
    witnessRef: string,
  ): Promise<CommitResult> {
    const allCheckpoints = await this.ledger.getAllCheckpoints(runId);

    const prepareRecord = allCheckpoints.find(
      (r) =>
        !r.is_committed && r.checkpoint.checkpoint_id === checkpointId,
    );
    if (!prepareRecord) {
      return { success: false, error: 'prepare record not found' };
    }

    const prepared = prepareRecord.checkpoint;
    const now = new Date().toISOString();
    const committed = RecoveryCheckpointSchema.parse({
      ...prepared,
      committed_at: now,
      witness_checkpoint_ref: witnessRef,
    });
    await this.ledger.appendCheckpoint(committed, true);
    return { success: true };
  }

  async getLastCommitted(runId: string) {
    const checkpoints = await this.ledger.getCheckpoints(runId);
    return checkpoints[checkpoints.length - 1] ?? null;
  }

  async validateChain(runId: string): Promise<ChainValidationResult> {
    const checkpoints = await this.ledger.getCheckpoints(runId);
    for (let i = 0; i < checkpoints.length; i++) {
      const curr = checkpoints[i]!;
      const prev = i > 0 ? checkpoints[i - 1]! : null;
      if (prev && curr.checkpoint_prev_hash !== prev.state_vector_hash) {
        return { valid: false, error: 'chain link mismatch' };
      }
      if (i === 0 && curr.checkpoint_prev_hash !== null) {
        return { valid: false, error: 'first checkpoint must have null prev_hash' };
      }
      if (!RECOVERY_HASH_REGEX.test(curr.state_vector_hash)) {
        return { valid: false, error: 'invalid hash' };
      }
    }
    return { valid: true };
  }
}
