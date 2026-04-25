/**
 * Two-phase checkpoint manager implementation.
 *
 * Phase 5.4 — Failure-Recovery Checkpoint, Retry, and Resume Governance.
 * Only committed checkpoints are resumable (FR-001).
 *
 * WR-162 SP 9 — disk-backed JSON snapshot persistence with `<final>.tmp`
 * → `fs.rename(<final>)` write-rename atomicity (SUPV-SP9-001/002), `<final>`
 * first crash-recovery preference with orphan tmp cleanup (SUPV-SP9-003), and
 * exhaustive hash-chain validation (SUPV-SP9-004 — body preserved verbatim).
 * Selective node-boundary triggering policy is dep-injected (SUPV-SP9-006);
 * the optional witness dep is constructor-stashed but unused at runtime in V1
 * (SUPV-SP9-013 — snapshot writes do NOT emit; ledger seal/corruption do).
 * Cross-platform atomicity flows through Node's `fs.rename` normalization with
 * no platform branches in our code (SUPV-SP9-015).
 */
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type {
  IRecoveryLedgerStore,
  ICheckpointManager,
  CheckpointSnapshot,
  PrepareResult,
  CommitResult,
  ChainValidationResult,
  IWitnessService,
  RecoveryCheckpoint,
} from '@nous/shared';
import {
  RecoveryCheckpointSchema,
  RECOVERY_HASH_REGEX,
} from '@nous/shared';

/**
 * SUPV-SP9-006 + SUPV-SP9-012 + SUPV-SP9-013 — dep-injected construction
 * shape. `dir` is the filesystem location for snapshot files (per-run subdir
 * `${dir}/run-${runId}/`). `triggerPolicy` is a closed-enum value consumed by
 * call sites that drive `prepare`/`commit` (orchestrator-side wiring is
 * future-SP scope per Goals Constraint 2). `witness` is plumbed-but-unused in
 * V1 (snapshot-time emission deferred per SUPV-SP9-013).
 */
export interface CheckpointManagerDeps {
  /** Filesystem directory for snapshot files. Each run gets a subdir. */
  readonly dir: string;
  /** Optional witness for snapshot-time emission (deferred — see SUPV-SP9-013). */
  readonly witness?: IWitnessService;
  /** Selective node-boundary triggering policy. */
  readonly triggerPolicy?: 'node-boundary' | 'every-event';
}

export class CheckpointManager implements ICheckpointManager {
  constructor(
    private readonly ledger: IRecoveryLedgerStore,
    private readonly deps: CheckpointManagerDeps,
  ) {}

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

    // SUPV-SP9-001 — write-rename atomicity. SUPV-SP9-002 — single-tmp-per-final.
    // SUPV-SP9-015 — no platform branches; Node normalizes POSIX rename(2) and
    // Windows MoveFileExW. fs.rename throws on EXDEV; do not add a copy+delete
    // fallback (per feedback_no_heuristic_bandaids.md rule 1).
    const runDir = path.join(this.deps.dir, `run-${runId}`);
    await fs.mkdir(runDir, { recursive: true });
    const finalPath = path.join(runDir, `snapshot-${checkpointId}.json`);
    const tmpPath = `${finalPath}.tmp`;
    const payload = JSON.stringify(committed) + '\n';
    await fs.writeFile(tmpPath, payload, 'utf8');
    await fs.rename(tmpPath, finalPath);

    // Mirror to ledger backing for getAllCheckpoints visibility (preserves
    // pre-SP-9 in-flight prepare/commit semantics; the ledger's checkpoint
    // cache backs `getAllCheckpoints` for prepare-record discovery).
    await this.ledger.appendCheckpoint(committed, true);
    return { success: true };
  }

  async getLastCommitted(runId: string): Promise<RecoveryCheckpoint | null> {
    // SUPV-SP9-003 — `<final>` first preference; orphan `<final>.tmp` discarded.
    // Per `feedback_no_heuristic_bandaids.md` rule 6 (no mtime heuristic; no
    // merge of `<tmp>` into `<final>`). Empty result feeds SP 8 orchestrator's
    // no-checkpoint branch returning `recovery_failed_hard_stop` per
    // `recovery-orchestrator.ts:76–82` (closes Goals N2).
    const runDir = path.join(this.deps.dir, `run-${runId}`);
    let entries: string[];
    try {
      entries = await fs.readdir(runDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        // No prior run directory — fall through to ledger fallback.
        entries = [];
      } else {
        throw err;
      }
    }

    const finals = entries.filter(
      (e) => e.endsWith('.json') && !e.endsWith('.tmp'),
    );
    const orphanTmps = entries.filter((e) => e.endsWith('.json.tmp'));

    // Discard orphan <final>.tmp files (single-process posture; no merge).
    for (const tmp of orphanTmps) {
      await fs
        .unlink(path.join(runDir, tmp))
        .catch(() => undefined);
    }

    if (finals.length === 0) return null;

    const snapshots: RecoveryCheckpoint[] = [];
    for (const final of finals) {
      const raw = await fs.readFile(path.join(runDir, final), 'utf8');
      snapshots.push(RecoveryCheckpointSchema.parse(JSON.parse(raw)));
    }
    snapshots.sort(
      (a, b) =>
        new Date(a.committed_at!).getTime() -
        new Date(b.committed_at!).getTime(),
    );
    return snapshots[snapshots.length - 1] ?? null;
  }

  // SUPV-SP9-004 — exhaustive walk preserved verbatim from pre-SP-9. The data
  // source (ledger.getCheckpoints) is unchanged; SP 9 keeps the chain-walk
  // semantics. Per feedback_no_heuristic_bandaids.md rule 4 (exhaustive walk;
  // no sampling).
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
