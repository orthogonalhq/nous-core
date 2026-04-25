/**
 * CheckpointManager disk-backed unit tests.
 *
 * WR-162 SP 9 — Checkpoint JSON/JSONL Storage + Atomicity. Validates:
 *   - SUPV-SP9-001 + SUPV-SP9-002 — write-rename atomicity; single-tmp-per-final.
 *   - SUPV-SP9-003 — orphan `<final>.tmp` cleanup; `<final>` first preference.
 *   - SUPV-SP9-004 — exhaustive hash-chain walk (preserved verbatim from pre-SP-9).
 *   - SUPV-SP9-006 — dep-injected triggerPolicy contract (runtime predicate
 *     deferred to future SP per IP § Boundary notes + Goals Constraint 2).
 *   - SUPV-SP9-012 — constructor signature widening (deps arg required).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { InMemoryRecoveryLedgerStore } from '../../recovery/recovery-ledger-store.js';
import {
  CheckpointManager,
  type CheckpointManagerDeps,
} from '../../recovery/checkpoint-manager.js';

const RUN_ID = '550e8400-e29b-41d4-a716-446655440000';
const PROJECT_ID = '660e8400-e29b-41d4-a716-446655440001';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function makeTmpDir(): string {
  return join(tmpdir(), 'nous-recovery-test', randomUUID());
}

function makeManager(deps: Partial<CheckpointManagerDeps> = {}): {
  manager: CheckpointManager;
  ledger: InMemoryRecoveryLedgerStore;
  dir: string;
} {
  const dir = deps.dir ?? makeTmpDir();
  const ledger = new InMemoryRecoveryLedgerStore();
  const manager = new CheckpointManager(ledger, {
    dir,
    triggerPolicy: 'node-boundary',
    ...deps,
  });
  return { manager, ledger, dir };
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

describe('CheckpointManager disk-backed', () => {
  describe('UT-SP9-CKPT-WRITE — clean write+rename happy path', () => {
    it('produces exactly one snapshot file and zero orphan tmps', async () => {
      const { manager, dir } = makeManager();

      const prep = await manager.prepare(RUN_ID, PROJECT_ID, SNAPSHOT);
      const commit = await manager.commit(
        RUN_ID,
        prep.checkpoint_id!,
        'witness-ref',
      );
      expect(commit.success).toBe(true);

      const runDir = join(dir, `run-${RUN_ID}`);
      const entries = await fs.readdir(runDir);
      const finals = entries.filter(
        (e) => e.endsWith('.json') && !e.endsWith('.tmp'),
      );
      const tmps = entries.filter((e) => e.endsWith('.tmp'));
      expect(finals).toHaveLength(1);
      expect(tmps).toHaveLength(0);

      const last = await manager.getLastCommitted(RUN_ID);
      expect(last).not.toBeNull();
      expect(last!.checkpoint_id).toBe(prep.checkpoint_id);
    });
  });

  describe('UT-SP9-CKPT-CRASH-TMP-ONLY — orphan <tmp>; no <final>', () => {
    it('returns null AND deletes the orphan tmp', async () => {
      const dir = makeTmpDir();
      const runDir = join(dir, `run-${RUN_ID}`);
      await fs.mkdir(runDir, { recursive: true });
      const tmpPath = join(runDir, 'snapshot-orphan.json.tmp');
      await fs.writeFile(tmpPath, '{"orphan": true}\n', 'utf8');

      const { manager } = makeManager({ dir });
      const last = await manager.getLastCommitted(RUN_ID);
      expect(last).toBeNull();

      const remaining = await fs.readdir(runDir);
      expect(remaining.filter((e) => e.endsWith('.tmp'))).toHaveLength(0);
    });
  });

  describe('UT-SP9-CKPT-CRASH-BOTH — <final> + orphan <tmp>', () => {
    it('returns <final> content AND deletes the orphan tmp', async () => {
      const { manager: m1, dir } = makeManager();
      const prep = await m1.prepare(RUN_ID, PROJECT_ID, SNAPSHOT);
      await m1.commit(RUN_ID, prep.checkpoint_id!, 'w');

      // Inject orphan tmp alongside the legitimate <final>.
      const runDir = join(dir, `run-${RUN_ID}`);
      const orphanTmpPath = join(runDir, 'snapshot-orphan.json.tmp');
      await fs.writeFile(orphanTmpPath, '{"orphan": true}\n', 'utf8');

      // "Restart" via fresh manager pointed at the same dir.
      const { manager: m2 } = makeManager({ dir });
      const last = await m2.getLastCommitted(RUN_ID);
      expect(last).not.toBeNull();
      expect(last!.checkpoint_id).toBe(prep.checkpoint_id);

      const remaining = await fs.readdir(runDir);
      expect(remaining.filter((e) => e.endsWith('.tmp'))).toHaveLength(0);
    });
  });

  describe('UT-SP9-CKPT-CHAIN-TAMPER — hash-chain validation rejects tampered chain', () => {
    it('returns valid: false on chain-link mismatch', async () => {
      const { manager } = makeManager();

      // First committed checkpoint.
      const p1 = await manager.prepare(RUN_ID, PROJECT_ID, SNAPSHOT);
      await manager.commit(RUN_ID, p1.checkpoint_id!, 'w1');

      // Second checkpoint that should chain-link via state_vector_hash but
      // we'll inject a chain-break by mutating the ledger checkpoint cache.
      const p2 = await manager.prepare(RUN_ID, PROJECT_ID, {
        ...SNAPSHOT,
        state_vector_hash: HASH_B,
      });
      await manager.commit(RUN_ID, p2.checkpoint_id!, 'w2');

      // Ledger has both committed records; mutate the second's
      // checkpoint_prev_hash via a tamper.
      const all = await (
        manager as unknown as {
          ledger: InMemoryRecoveryLedgerStore;
        }
      ).ledger.getAllCheckpoints(RUN_ID);
      // Find the committed second record and mutate it.
      const committed = all.filter((r) => r.is_committed);
      expect(committed.length).toBeGreaterThanOrEqual(2);
      const tamperedHash = 'c'.repeat(64);
      committed[1]!.checkpoint.checkpoint_prev_hash = tamperedHash;

      const result = await manager.validateChain(RUN_ID);
      expect(result.valid).toBe(false);
    });
  });

  describe('UT-SP9-CKPT-TRIGGER-NODEBOUND — dep-injection-time contract', () => {
    it('preserves the triggerPolicy field across method calls (dep-injection-time contract)', async () => {
      // Per IP § Boundary notes + Goals Constraint 2: SP 9 plumbs the
      // triggerPolicy as a CheckpointManagerDeps field; the runtime predicate
      // that consumes the policy at the orchestrator-side capture-decision is
      // future-SP scope. This test verifies the dep-injection-time contract
      // (the field is accepted at construction; the manager operates without
      // mutating it).
      const { manager } = makeManager({ triggerPolicy: 'node-boundary' });
      const prep = await manager.prepare(RUN_ID, PROJECT_ID, SNAPSHOT);
      await manager.commit(RUN_ID, prep.checkpoint_id!, 'w');
      // Field is package-private; assert via duck-typed read of deps.
      const deps = (manager as unknown as { deps: CheckpointManagerDeps }).deps;
      expect(deps.triggerPolicy).toBe('node-boundary');
    });
  });

  describe('UT-SP9-CKPT-COMMIT-CHAIN — multi-commit chain integrity', () => {
    it('three sequential commits validate as a clean chain', async () => {
      const { manager } = makeManager();

      const p1 = await manager.prepare(RUN_ID, PROJECT_ID, SNAPSHOT);
      await manager.commit(RUN_ID, p1.checkpoint_id!, 'w1');

      const p2 = await manager.prepare(RUN_ID, PROJECT_ID, {
        ...SNAPSHOT,
        state_vector_hash: HASH_B,
      });
      await manager.commit(RUN_ID, p2.checkpoint_id!, 'w2');

      const p3 = await manager.prepare(RUN_ID, PROJECT_ID, {
        ...SNAPSHOT,
        state_vector_hash: 'd'.repeat(64),
      });
      await manager.commit(RUN_ID, p3.checkpoint_id!, 'w3');

      const result = await manager.validateChain(RUN_ID);
      expect(result.valid).toBe(true);
    });
  });

  describe('UT-SP9-CKPT-MULTI-RUN — per-run isolation', () => {
    it('two runs land in separate run-<id> subdirs', async () => {
      const { manager, dir } = makeManager();
      const RUN_ID_2 = '550e8400-e29b-41d4-a716-446655440002';

      const p1 = await manager.prepare(RUN_ID, PROJECT_ID, SNAPSHOT);
      await manager.commit(RUN_ID, p1.checkpoint_id!, 'w1');

      const p2 = await manager.prepare(RUN_ID_2, PROJECT_ID, SNAPSHOT);
      await manager.commit(RUN_ID_2, p2.checkpoint_id!, 'w2');

      const dir1Entries = await fs.readdir(join(dir, `run-${RUN_ID}`));
      const dir2Entries = await fs.readdir(join(dir, `run-${RUN_ID_2}`));
      expect(dir1Entries.filter((e) => e.endsWith('.json'))).toHaveLength(1);
      expect(dir2Entries.filter((e) => e.endsWith('.json'))).toHaveLength(1);
    });
  });

  describe('UT-SP9-CKPT-COMMIT-WITHOUT-PREPARE — interface contract', () => {
    it('commit returns prepare-record-not-found error', async () => {
      const { manager } = makeManager();
      const result = await manager.commit(RUN_ID, randomUUID(), 'w');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/prepare record not found/i);
    });
  });

  describe('UT-SP9-CKPT-CROSS-RENAME — cross-platform write-rename atomicity', () => {
    // SUPV-SP9-015 — unconditional cross-platform test (no skip-if-not-platform).
    // Node's fs.rename normalizes POSIX rename(2) and Windows MoveFileExW; the
    // assertion shape is identical on every CI platform.
    it('post-commit directory contains <final> only and zero <tmp> regardless of platform', async () => {
      const { manager, dir } = makeManager();
      const prep = await manager.prepare(RUN_ID, PROJECT_ID, SNAPSHOT);
      await manager.commit(RUN_ID, prep.checkpoint_id!, 'w');
      const runDir = join(dir, `run-${RUN_ID}`);
      const entries = await fs.readdir(runDir);
      expect(entries.filter((e) => e.endsWith('.json.tmp'))).toHaveLength(0);
      expect(
        entries.filter((e) => e.endsWith('.json') && !e.endsWith('.tmp')),
      ).toHaveLength(1);
    });
  });
});

beforeEach(() => {
  // Each test creates its own tmp dir via makeTmpDir; no global setup needed.
});
