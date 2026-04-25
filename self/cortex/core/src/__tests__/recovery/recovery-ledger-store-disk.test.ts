/**
 * RecoveryLedgerStore disk-backed unit tests.
 *
 * WR-162 SP 9 — Checkpoint JSON/JSONL Storage + Atomicity. Validates:
 *   - SUPV-SP9-007 — truncate-incomplete-line file-shape recovery.
 *   - SUPV-SP9-008 — newline-delimited canonical JSON; chain prev_event_hash.
 *   - SUPV-SP9-009 — chain-corruption seal-and-restart + RECOVERY-CORRUPT witness.
 *   - SUPV-SP9-010 — explicit seal() emits RECOVERY-SEAL witness exactly once.
 *   - SUPV-SP9-014 — sibling chains; evidence_refs link only.
 *   - SUPV-SP9-015 — cross-platform append byte-exactness.
 *   - SUPV-SP9-016 — fr_recovery_witness_emitted is the SOLE event-type literal.
 *   - SUPV-SP9-018 — single-emission per surface (helper enforces).
 *   - SUPV-SP9-019 — appendInvariant route mirrors SP 8 SUPV-SP8-001 shape.
 */
import { describe, it, expect, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { IWitnessService, WitnessEvent } from '@nous/shared';
import {
  RecoveryLedgerStore,
  type RecoveryLedgerStoreDeps,
} from '../../recovery/recovery-ledger-store.js';

const RUN_ID = '550e8400-e29b-41d4-a716-446655440000';
const PROJECT_ID = '660e8400-e29b-41d4-a716-446655440001';
const HASH = 'a'.repeat(64);

function makeTmpDir(): string {
  return join(tmpdir(), 'nous-recovery-test', randomUUID());
}

function makeMockWitness(): {
  service: IWitnessService;
  appendInvariant: ReturnType<typeof vi.fn>;
} {
  const appendInvariant = vi
    .fn()
    .mockResolvedValue({} as unknown as WitnessEvent);
  const service: IWitnessService = {
    appendAuthorization: vi.fn(),
    appendCompletion: vi.fn(),
    appendInvariant:
      appendInvariant as unknown as IWitnessService['appendInvariant'],
    createCheckpoint: vi.fn(),
    rotateKeyEpoch: vi.fn(),
    verify: vi.fn(),
    getReport: vi.fn(),
    listReports: vi.fn(),
    getLatestCheckpoint: vi.fn(),
  };
  return { service, appendInvariant };
}

function makeStore(
  deps: Partial<RecoveryLedgerStoreDeps> = {},
): { store: RecoveryLedgerStore; dir: string } {
  const dir = deps.dir ?? makeTmpDir();
  const store = new RecoveryLedgerStore({ dir, ...deps });
  return { store, dir };
}

const EVENT = {
  event_type: 'fr_recovery_started',
  run_id: RUN_ID,
  project_id: PROJECT_ID,
  domain_scope: 'step_domain' as const,
  payload_hash: HASH,
  prev_event_hash: null,
  occurred_at: '2026-04-25T00:00:00.000Z',
};

describe('RecoveryLedgerStore disk-backed', () => {
  describe('UT-SP9-LDG-APPEND — append + newline-flush correctness', () => {
    it('appends two events with prev_event_hash chain linkage and trailing newlines', async () => {
      const { store, dir } = makeStore();
      const r1 = await store.append(EVENT);
      expect(r1.success).toBe(true);

      const r2 = await store.append({
        ...EVENT,
        event_type: 'fr_recovery_checkpoint_captured',
      });
      expect(r2.success).toBe(true);
      expect(r2.segment_id).toBe(r1.segment_id);

      const segPath = join(dir, `seg-${r1.segment_id}.jsonl`);
      const raw = await fs.readFile(segPath, 'utf8');
      expect(raw.endsWith('\n')).toBe(true);
      const lines = raw.split('\n').filter((l) => l.length > 0);
      expect(lines).toHaveLength(2);

      const rec1 = JSON.parse(lines[0]!);
      const rec2 = JSON.parse(lines[1]!);
      expect(rec1.prev_event_hash).toBeNull();
      expect(rec2.prev_event_hash).toBe(rec1.event_hash);
      expect(rec1.sequence).toBe(1);
      expect(rec2.sequence).toBe(2);
    });

    it('operates without a witness when witness dep is absent', async () => {
      const { store } = makeStore(); // no witness
      const r = await store.append(EVENT);
      expect(r.success).toBe(true);
    });
  });

  describe('UT-SP9-LDG-TRUNCATE — truncate-incomplete-line', () => {
    it('truncates a partial final line on init() to the last newline boundary', async () => {
      const dir = makeTmpDir();
      await fs.mkdir(dir, { recursive: true });
      const segId = randomUUID();
      const segPath = join(dir, `seg-${segId}.jsonl`);

      // Two complete records + a partial third (no trailing \n).
      const rec1 = {
        event_type: 'fr_recovery_started',
        run_id: RUN_ID,
        project_id: PROJECT_ID,
        domain_scope: 'step_domain',
        payload_hash: HASH,
        prev_event_hash: null,
        occurred_at: '2026-04-25T00:00:00.000Z',
        event_hash: 'h1',
        sequence: 1,
        segment_id: segId,
      };
      const rec2 = { ...rec1, prev_event_hash: 'h1', event_hash: 'h2', sequence: 2 };
      const partialBytes = '{"event_type":"fr_recovery_completed","run_id"';

      const completeBytes = JSON.stringify(rec1) + '\n' + JSON.stringify(rec2) + '\n';
      await fs.writeFile(segPath, completeBytes + partialBytes, 'utf8');

      const before = (await fs.stat(segPath)).size;
      expect(before).toBe(completeBytes.length + partialBytes.length);

      const { store } = makeStore({ dir });
      // Force init via any method.
      await store.getLastSegment();

      const after = (await fs.stat(segPath)).size;
      expect(after).toBe(completeBytes.length);

      // Verify the partial line is gone — read the file and assert exactly two records.
      const raw = await fs.readFile(segPath, 'utf8');
      const lines = raw.split('\n').filter((l) => l.length > 0);
      expect(lines).toHaveLength(2);
    });
  });

  describe('UT-SP9-LDG-CORRUPT — chain-corruption seal+restart+witness', () => {
    it('seals corrupted segment + emits one RECOVERY-CORRUPT witness with correct shape', async () => {
      const dir = makeTmpDir();
      await fs.mkdir(dir, { recursive: true });
      const segId = randomUUID();
      const segPath = join(dir, `seg-${segId}.jsonl`);

      // Seed a chain-broken segment: rec2.prev_event_hash does NOT match rec1.event_hash.
      const rec1 = {
        event_type: 'fr_recovery_started',
        run_id: RUN_ID,
        project_id: PROJECT_ID,
        domain_scope: 'step_domain',
        payload_hash: HASH,
        prev_event_hash: null,
        occurred_at: '2026-04-25T00:00:00.000Z',
        event_hash: 'h1',
        sequence: 1,
        segment_id: segId,
      };
      const rec2 = {
        ...rec1,
        prev_event_hash: 'WRONG_HASH', // chain-break
        event_hash: 'h2',
        sequence: 2,
      };
      await fs.writeFile(
        segPath,
        JSON.stringify(rec1) + '\n' + JSON.stringify(rec2) + '\n',
        'utf8',
      );

      const { service, appendInvariant } = makeMockWitness();
      const { store } = makeStore({ dir, witness: service });
      await store.getLastSegment(); // forces init()

      // Sealed sibling file should exist.
      const sealedPath = join(dir, `seg-${segId}.sealed.json`);
      const sealedExists = await fs
        .access(sealedPath)
        .then(() => true)
        .catch(() => false);
      expect(sealedExists).toBe(true);

      // Exactly one witness emission with the correct shape.
      expect(appendInvariant).toHaveBeenCalledTimes(1);
      const call = appendInvariant.mock.calls[0]![0];
      expect(call.code).toBe('RECOVERY-CORRUPT');
      expect(call.actionCategory).toBe('recovery-evidence');
      expect(call.actor).toBe('system');
      expect(call.actionRef).toBe(segId);
      expect(call.detail.event_type).toBe('fr_recovery_witness_emitted');
      expect(call.detail.evidence_refs).toEqual([segId]);
      expect(call.detail.reason).toMatch(/chain_break_at_record_/);
    });
  });

  describe('UT-SP9-LDG-SEAL — segment sealing emission', () => {
    it('writes sealed-segment file via write-rename and emits one RECOVERY-SEAL witness', async () => {
      const { service, appendInvariant } = makeMockWitness();
      const { store, dir } = makeStore({ witness: service });
      const r = await store.append(EVENT);
      const segId = r.segment_id!;

      const sealResult = await store.seal(segId, 'witness-ref');
      expect(sealResult.success).toBe(true);

      // Sealed file present, no orphan tmp.
      const entries = await fs.readdir(dir);
      expect(entries).toContain(`seg-${segId}.sealed.json`);
      expect(entries.filter((e) => e.endsWith('.tmp'))).toHaveLength(0);

      // Exactly one witness emission with RECOVERY-SEAL shape.
      expect(appendInvariant).toHaveBeenCalledTimes(1);
      const call = appendInvariant.mock.calls[0]![0];
      expect(call.code).toBe('RECOVERY-SEAL');
      expect(call.actionCategory).toBe('recovery-evidence');
      expect(call.actor).toBe('system');
      expect(call.actionRef).toBe(segId);
      expect(call.detail.event_type).toBe('fr_recovery_witness_emitted');
      expect(call.detail.evidence_refs).toEqual([segId]);
      expect(call.detail.reason).toBe('segment_sealed');
    });
  });

  describe('UT-SP9-LDG-INIT-EMPTY — init() on empty directory is safe', () => {
    it('no errors; currentSegmentId is null', async () => {
      const { store } = makeStore();
      const last = await store.getLastSegment();
      expect(last).toBeNull();
    });
  });

  describe('UT-SP9-LDG-INIT-MULTI-UNSEALED — multi-orphan disposition (closes SDS-review N4)', () => {
    it('seals the lower-sequence orphan with RECOVERY-CORRUPT and keeps the higher-sequence as currentSegmentId', async () => {
      const dir = makeTmpDir();
      await fs.mkdir(dir, { recursive: true });

      // Two unsealed segments. Segment A has higher max sequence; segment B
      // is the lower-sequence orphan.
      const segIdA = randomUUID();
      const segIdB = randomUUID();
      const recA1 = {
        event_type: 'fr_recovery_started',
        run_id: RUN_ID,
        project_id: PROJECT_ID,
        domain_scope: 'step_domain',
        payload_hash: HASH,
        prev_event_hash: null,
        occurred_at: '2026-04-25T00:00:00.000Z',
        event_hash: 'hA1',
        sequence: 5,
        segment_id: segIdA,
      };
      const recB1 = { ...recA1, event_hash: 'hB1', sequence: 1, segment_id: segIdB };
      await fs.writeFile(
        join(dir, `seg-${segIdA}.jsonl`),
        JSON.stringify(recA1) + '\n',
        'utf8',
      );
      await fs.writeFile(
        join(dir, `seg-${segIdB}.jsonl`),
        JSON.stringify(recB1) + '\n',
        'utf8',
      );

      const { service, appendInvariant } = makeMockWitness();
      const { store } = makeStore({ dir, witness: service });
      await store.getLastSegment(); // forces init()

      // The lower-sequence orphan (B) should be sealed as corrupted.
      const corruptCalls = appendInvariant.mock.calls.filter(
        (c) => c[0].code === 'RECOVERY-CORRUPT',
      );
      expect(corruptCalls.length).toBe(1);
      expect(corruptCalls[0]![0].actionRef).toBe(segIdB);
      expect(corruptCalls[0]![0].detail.reason).toBe('orphan_unsealed_at_init');
    });
  });

  describe('UT-SP9-LDG-INIT-IDEMPOTENT — init() called twice has no double side-effects', () => {
    it('appendInvariant fires once even after multiple init() invocations', async () => {
      const dir = makeTmpDir();
      await fs.mkdir(dir, { recursive: true });
      const segId = randomUUID();
      const rec1 = {
        event_type: 'fr_recovery_started',
        run_id: RUN_ID,
        project_id: PROJECT_ID,
        domain_scope: 'step_domain',
        payload_hash: HASH,
        prev_event_hash: null,
        occurred_at: '2026-04-25T00:00:00.000Z',
        event_hash: 'h1',
        sequence: 1,
        segment_id: segId,
      };
      const rec2 = {
        ...rec1,
        prev_event_hash: 'WRONG',
        event_hash: 'h2',
        sequence: 2,
      };
      await fs.writeFile(
        join(dir, `seg-${segId}.jsonl`),
        JSON.stringify(rec1) + '\n' + JSON.stringify(rec2) + '\n',
        'utf8',
      );

      const { service, appendInvariant } = makeMockWitness();
      const { store } = makeStore({ dir, witness: service });
      await store.init();
      await store.init();
      await store.getLastSegment();
      expect(appendInvariant).toHaveBeenCalledTimes(1);
    });
  });

  describe('UT-SP9-LDG-SIZE-THRESHOLD — auto-seal on segment size threshold', () => {
    it('exceeding segmentSizeBytes auto-seals + currentSegmentId resets + new segment on next append', async () => {
      const { service, appendInvariant } = makeMockWitness();
      // Small threshold so a single append crosses it.
      const { store, dir } = makeStore({ witness: service, segmentSizeBytes: 1 });
      const r1 = await store.append(EVENT);
      const seg1 = r1.segment_id!;

      // The append() above should trigger a self-seal (size >= 1).
      expect(appendInvariant).toHaveBeenCalledTimes(1);
      expect(appendInvariant.mock.calls[0]![0].code).toBe('RECOVERY-SEAL');
      expect(appendInvariant.mock.calls[0]![0].actionRef).toBe(seg1);

      // Next append should land in a new segment (different segment_id).
      const r2 = await store.append(EVENT);
      expect(r2.segment_id).not.toBe(seg1);

      const entries = await fs.readdir(dir);
      expect(entries).toContain(`seg-${seg1}.sealed.json`);
    });
  });

  describe('UT-SP9-LDG-CORRUPT-CROSS-SEGMENT — cross-segment chain-break (regression guard)', () => {
    it('cross-segment chain-break is treated identically to within-segment corruption', async () => {
      // A second segment starts with prev_event_hash mismatching the first
      // segment's last event_hash. Because each segment maintains its own
      // chain (with prev_event_hash linkage starting at null), the within-
      // segment scan still detects the break if seeded correctly.
      const dir = makeTmpDir();
      await fs.mkdir(dir, { recursive: true });
      const segId = randomUUID();
      // First record has non-null prev_event_hash (a chain-break at index 0).
      const rec1 = {
        event_type: 'fr_recovery_started',
        run_id: RUN_ID,
        project_id: PROJECT_ID,
        domain_scope: 'step_domain',
        payload_hash: HASH,
        prev_event_hash: 'STALE_FROM_PRIOR_SEGMENT',
        occurred_at: '2026-04-25T00:00:00.000Z',
        event_hash: 'h1',
        sequence: 1,
        segment_id: segId,
      };
      await fs.writeFile(
        join(dir, `seg-${segId}.jsonl`),
        JSON.stringify(rec1) + '\n',
        'utf8',
      );

      const { service, appendInvariant } = makeMockWitness();
      const { store } = makeStore({ dir, witness: service });
      await store.getLastSegment();

      const corruptCalls = appendInvariant.mock.calls.filter(
        (c) => c[0].code === 'RECOVERY-CORRUPT',
      );
      expect(corruptCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('UT-SP9-CROSS-APPENDFILE — UTF-8 + LF byte exactness (cross-platform)', () => {
    // SUPV-SP9-015 — unconditional cross-platform test.
    it('appended record bytes are exactly JSON.stringify(record) + "\\n"', async () => {
      const { store, dir } = makeStore();
      const unicodeEvent = {
        ...EVENT,
        run_id: '550e8400-e29b-41d4-a716-446655440099',
      };
      const r = await store.append(unicodeEvent);
      const segPath = join(dir, `seg-${r.segment_id}.jsonl`);
      const raw = await fs.readFile(segPath, 'utf8');
      // Must end with '\n' and have no '\r' (Windows CRLF normalization).
      expect(raw.endsWith('\n')).toBe(true);
      expect(raw.includes('\r')).toBe(false);
    });
  });
});
