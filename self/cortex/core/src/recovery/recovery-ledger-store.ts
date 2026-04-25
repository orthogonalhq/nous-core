/**
 * Recovery ledger store implementations.
 *
 * Phase 5.4 — Failure-Recovery Checkpoint, Retry, and Resume Governance.
 * Append-only segments with hash-chain integrity. Seal emits witness_ref.
 *
 * WR-162 SP 9 — disk-backed `RecoveryLedgerStore` JSONL implementation alongside
 * the pre-existing `InMemoryRecoveryLedgerStore` (preserved verbatim per
 * SUPV-SP9-011 for SP 8 baseline tests). The disk-backed class lands the V1
 * production storage data plane: newline-delimited canonical JSON records
 * (SUPV-SP9-008); deterministic truncate-incomplete-line crash recovery on
 * `init()` (SUPV-SP9-007); exhaustive forward chain-walk with seal-and-restart
 * on corruption (SUPV-SP9-009 — no skip+continue); witness-linked sealing
 * through `IWitnessService.appendInvariant` with `'RECOVERY-SEAL'` /
 * `'RECOVERY-CORRUPT'` invariant codes routed through SP 8's `'recovery-evidence'`
 * action category (SUPV-SP9-010 / SUPV-SP9-019); single-emission per surface
 * via private `emitRecoveryWitness` helper (SUPV-SP9-018 — mirrors SP 8
 * SUPV-SP8-005). The `fr_recovery_witness_emitted` literal (SP 2 RecoveryEventType
 * #9; reserved by SP 8 SUPV-SP8-019) is the SOLE event-type SP 9 emits
 * (SUPV-SP9-016). Cross-platform via Node's `fs` API normalization, no platform
 * branches (SUPV-SP9-015).
 */
import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type {
  RecoveryCriticalEvent,
  RecoveryDomain,
  RecoverySegment,
  RecoveryCheckpoint,
  IWitnessService,
  InvariantCode,
  ProjectId,
} from '@nous/shared';
import { RecoverySegmentSchema } from '@nous/shared';
import type {
  IRecoveryLedgerStore,
  AppendResult,
  SealResult,
} from '@nous/shared';

function sha256(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

interface StoredEvent {
  event: RecoveryCriticalEvent;
  event_hash: string;
  sequence: number;
  segment_id: string;
}

interface StoredCheckpoint {
  checkpoint: RecoveryCheckpoint;
  is_committed: boolean;
}

/**
 * SUPV-SP9-019 — dep-injected construction shape for the disk-backed
 * `RecoveryLedgerStore`. `dir` is the filesystem location for segment files;
 * each segment lives at `${dir}/seg-${segment_id}.jsonl` with a sibling
 * `seg-${segment_id}.sealed.json` once sealed. `witness` is the optional
 * IWitnessService for seal/corruption emissions (SUPV-SP9-010 + SUPV-SP9-009);
 * the optional typing preserves the test-fixture path. `segmentSizeBytes`
 * defaults to 8 MiB per spec.
 */
export interface RecoveryLedgerStoreDeps {
  /** Filesystem directory for ledger segment files. */
  readonly dir: string;
  /** Optional witness for seal/corruption emission. */
  readonly witness?: IWitnessService;
  /** Optional segment-size threshold in bytes (default: 8 MiB). */
  readonly segmentSizeBytes?: number;
}

/**
 * SUPV-SP9-008 + SDS-review N2 — package-internal JSONL record shape. Not
 * exported; not validated against a Zod schema (no `@nous/shared` edit per
 * SUPV-SP9-020). Round-tripped via `JSON.parse` + structural cast.
 */
interface JsonlLedgerRecord {
  // RecoveryCriticalEvent fields (mirrored):
  event_type: string;
  run_id: string;
  project_id: string;
  domain_scope: RecoveryDomain;
  payload_hash: string;
  prev_event_hash: string | null;
  occurred_at: string;
  // SP 9 ledger-line metadata:
  event_hash: string;
  sequence: number;
  segment_id: string;
}

/**
 * Pre-SP-9 in-memory ledger store. Preserved verbatim per SUPV-SP9-011 for
 * the SP 8 baseline tests (`recovery-flow-integration.test.ts`,
 * `phase-5.4-recovery-adversarial.test.ts`, `recovery-ledger-store.test.ts`,
 * `recovery-orchestrator.test.ts`). The disk-backed `RecoveryLedgerStore`
 * (defined later in this file) is the SP 9 V1 production deliverable.
 */
export class InMemoryRecoveryLedgerStore implements IRecoveryLedgerStore {
  private readonly events: StoredEvent[] = [];
  private readonly segments = new Map<string, RecoverySegment>();
  private readonly checkpoints = new Map<string, StoredCheckpoint[]>();
  private lastSegmentHash: string | null = null;
  private currentSegmentId: string | null = null;
  private nextSequence = 0;

  async append(event: RecoveryCriticalEvent): Promise<AppendResult> {
    const segmentId = this.currentSegmentId ?? randomUUID();
    if (!this.currentSegmentId) {
      this.currentSegmentId = segmentId;
    }

    const prevHash =
      this.events.length > 0
        ? this.events[this.events.length - 1]!.event_hash
        : null;
    const payload = JSON.stringify({
      event_type: event.event_type,
      run_id: event.run_id,
      project_id: event.project_id,
      domain_scope: event.domain_scope,
      payload_hash: event.payload_hash,
      prev_event_hash: prevHash,
      occurred_at: event.occurred_at,
    });
    const eventHash = sha256(payload + (prevHash ?? ''));

    this.events.push({
      event,
      event_hash: eventHash,
      sequence: ++this.nextSequence,
      segment_id: segmentId,
    });

    return {
      success: true,
      segment_id: segmentId,
      sequence: this.nextSequence,
    };
  }

  async seal(segmentId: string, witnessRef: string): Promise<SealResult> {
    const segmentEvents = this.events.filter((e) => e.segment_id === segmentId);
    if (segmentEvents.length === 0) {
      return { success: false, error: 'segment has no events' };
    }

    const first = segmentEvents[0]!;
    const last = segmentEvents[segmentEvents.length - 1]!;
    const segmentPayload = segmentEvents.map((e) => e.event_hash).join('');
    const segmentHash = sha256(
      segmentPayload + (this.lastSegmentHash ?? '') + witnessRef,
    );

    const segment = RecoverySegmentSchema.parse({
      segment_id: segmentId,
      segment_seq_start: first.sequence,
      segment_seq_end: last.sequence,
      prev_segment_hash: this.lastSegmentHash,
      segment_hash: segmentHash,
      sealed_at: new Date().toISOString(),
    });
    this.segments.set(segmentId, segment);
    this.lastSegmentHash = segmentHash;
    this.currentSegmentId = null;

    return { success: true };
  }

  async getLastSegment(): Promise<RecoverySegment | null> {
    const sealed = [...this.segments.values()].sort(
      (a, b) => (b.segment_seq_end ?? 0) - (a.segment_seq_end ?? 0),
    );
    return sealed[0] ?? null;
  }

  async getCheckpoints(runId: string): Promise<RecoveryCheckpoint[]> {
    const list = this.checkpoints.get(runId) ?? [];
    return list
      .filter((s) => s.is_committed)
      .map((s) => s.checkpoint)
      .sort(
        (a, b) =>
          new Date(a.committed_at!).getTime() -
          new Date(b.committed_at!).getTime(),
      );
  }

  /** Internal: append checkpoint (used by CheckpointManager). */
  async appendCheckpoint(
    checkpoint: RecoveryCheckpoint,
    isCommitted: boolean,
  ): Promise<void> {
    const list = this.checkpoints.get(checkpoint.run_id) ?? [];
    list.push({ checkpoint, is_committed: isCommitted });
    this.checkpoints.set(checkpoint.run_id, list);
  }

  async getAllCheckpoints(
    runId: string,
  ): Promise<{ checkpoint: RecoveryCheckpoint; is_committed: boolean }[]> {
    const list = this.checkpoints.get(runId) ?? [];
    return list.map((s) => ({
      checkpoint: s.checkpoint,
      is_committed: s.is_committed,
    }));
  }
}

/**
 * Disk-backed JSONL ledger store. Implements `IRecoveryLedgerStore` with
 * filesystem persistence per `checkpoint-storage-format-v1.md`.
 *
 * SP 9 invariants (SUPV-SP9-007..010, 014..019):
 * - Append: newline-delimited canonical JSON; one record per line; UTF-8
 *   (SUPV-SP9-008).
 * - Init: truncate-incomplete-line via deterministic last-`\n` boundary
 *   (SUPV-SP9-007); exhaustive forward chain-walk with seal-and-restart on
 *   corruption (SUPV-SP9-009).
 * - Seal: write sealing record + final hash via `<final>.tmp` → `fs.rename`;
 *   single witness emission via `emitRecoveryWitness('RECOVERY-SEAL', ...)`
 *   (SUPV-SP9-010 + SUPV-SP9-018).
 * - Corruption: seal corrupted segment + start new segment + emit one witness
 *   event with `'RECOVERY-CORRUPT'` (SUPV-SP9-009 + SUPV-SP9-018; no
 *   skip+continue per `feedback_no_heuristic_bandaids.md` rule 3).
 * - Witness emission: `appendInvariant` route mirrors SP 8 SUPV-SP8-001 shape
 *   (SUPV-SP9-019); `actionRef` is `segment_id`; `detail.event_type` is
 *   `'fr_recovery_witness_emitted'` (sole literal SP 9 emits per SUPV-SP9-016).
 * - Sibling chain separation: checkpoint hash-chain, ledger hash-chain, and
 *   witness chain are independent; evidence-linked at seal/corruption points
 *   only via `detail.evidence_refs` (SUPV-SP9-014; CHAIN-001 preserved).
 */
export class RecoveryLedgerStore implements IRecoveryLedgerStore {
  private readonly segments = new Map<string, RecoverySegment>();
  private readonly checkpointsCache = new Map<string, StoredCheckpoint[]>();
  private lastSegmentHash: string | null = null;
  private currentSegmentId: string | null = null;
  private nextSequence = 0;
  private lastEventHash: string | null = null;
  private initialized = false;

  constructor(private readonly deps: RecoveryLedgerStoreDeps) {}

  // ---------------------------------------------------------------------
  // Public IRecoveryLedgerStore methods
  // ---------------------------------------------------------------------

  async append(event: RecoveryCriticalEvent): Promise<AppendResult> {
    await this.init();

    const segmentId = this.currentSegmentId ?? randomUUID();
    if (!this.currentSegmentId) {
      this.currentSegmentId = segmentId;
    }

    const segPath = this.segmentPath(segmentId);
    const prevHash = this.lastEventHash;
    const recordCore = {
      event_type: event.event_type,
      run_id: event.run_id,
      project_id: event.project_id,
      domain_scope: event.domain_scope,
      payload_hash: event.payload_hash,
      prev_event_hash: prevHash,
      occurred_at: event.occurred_at,
    };
    const eventHash = sha256(JSON.stringify(recordCore) + (prevHash ?? ''));
    const record: JsonlLedgerRecord = {
      ...recordCore,
      event_hash: eventHash,
      sequence: ++this.nextSequence,
      segment_id: segmentId,
    };

    // SUPV-SP9-008 — newline-delimited canonical JSON; one record per line;
    // UTF-8. fs.appendFile from node:fs/promises writes exact bytes (no
    // Windows CRLF normalization).
    const line = JSON.stringify(record) + '\n';
    await fs.appendFile(segPath, line, 'utf8');
    this.lastEventHash = eventHash;

    // Optional segment-size threshold seal.
    const stat = await fs.stat(segPath);
    if (stat.size >= (this.deps.segmentSizeBytes ?? 8 * 1024 * 1024)) {
      await this.seal(segmentId, '');
    }

    return {
      success: true,
      segment_id: segmentId,
      sequence: record.sequence,
    };
  }

  async seal(segmentId: string, witnessRef: string): Promise<SealResult> {
    await this.init();
    const segPath = this.segmentPath(segmentId);
    const records = await this.loadJsonlRecords(segPath);
    if (records.length === 0) {
      return { success: false, error: 'segment has no events' };
    }

    const first = records[0]!;
    const last = records[records.length - 1]!;
    const segmentPayload = records.map((r) => r.event_hash).join('');
    const segmentHash = sha256(
      segmentPayload + (this.lastSegmentHash ?? '') + witnessRef,
    );
    const segment = RecoverySegmentSchema.parse({
      segment_id: segmentId,
      segment_seq_start: first.sequence,
      segment_seq_end: last.sequence,
      prev_segment_hash: this.lastSegmentHash,
      segment_hash: segmentHash,
      sealed_at: new Date().toISOString(),
    });

    // SUPV-SP9-001 — write-rename atomicity for the sealed-segment record.
    await this.writeSealedSegmentFile(segmentId, segment);

    this.segments.set(segmentId, segment);
    this.lastSegmentHash = segmentHash;
    if (this.currentSegmentId === segmentId) {
      this.currentSegmentId = null;
    }

    // SUPV-SP9-010 + SUPV-SP9-018 — single witness emission per seal.
    await this.emitRecoveryWitness(
      'RECOVERY-SEAL',
      segmentId,
      'segment_sealed',
      last.project_id,
    );

    return { success: true };
  }

  async getLastSegment(): Promise<RecoverySegment | null> {
    await this.init();
    const sealed = [...this.segments.values()].sort(
      (a, b) => (b.segment_seq_end ?? 0) - (a.segment_seq_end ?? 0),
    );
    return sealed[0] ?? null;
  }

  async getCheckpoints(runId: string): Promise<RecoveryCheckpoint[]> {
    await this.init();
    const list = this.checkpointsCache.get(runId) ?? [];
    return list
      .filter((s) => s.is_committed)
      .map((s) => s.checkpoint)
      .sort(
        (a, b) =>
          new Date(a.committed_at!).getTime() -
          new Date(b.committed_at!).getTime(),
      );
  }

  async appendCheckpoint(
    checkpoint: RecoveryCheckpoint,
    isCommitted: boolean,
  ): Promise<void> {
    // In-memory cache for prepare/commit semantics. CheckpointManager.commit
    // (per SUPV-SP9-001) is the disk-write site for committed snapshots; the
    // cache here mirrors the record so getAllCheckpoints can find prepare
    // records pre-commit and committed records pre-validateChain.
    const list = this.checkpointsCache.get(checkpoint.run_id) ?? [];
    list.push({ checkpoint, is_committed: isCommitted });
    this.checkpointsCache.set(checkpoint.run_id, list);
  }

  async getAllCheckpoints(
    runId: string,
  ): Promise<{ checkpoint: RecoveryCheckpoint; is_committed: boolean }[]> {
    const list = this.checkpointsCache.get(runId) ?? [];
    return list.map((s) => ({
      checkpoint: s.checkpoint,
      is_committed: s.is_committed,
    }));
  }

  // ---------------------------------------------------------------------
  // init() — startup recovery
  // ---------------------------------------------------------------------

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    await fs.mkdir(this.deps.dir, { recursive: true });

    let entries: string[];
    try {
      entries = await fs.readdir(this.deps.dir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }

    const segmentFiles = entries.filter(
      (f) => f.startsWith('seg-') && f.endsWith('.jsonl'),
    );

    // Phase 1 — truncate-incomplete-line per SUPV-SP9-007. Deterministic
    // file-shape recovery; locate the last `\n` byte and truncate to that
    // boundary (newline IS the contract). No content-pattern matching per
    // feedback_no_heuristic_bandaids.md rule 2.
    for (const seg of segmentFiles) {
      await this.truncateIncompleteLine(path.join(this.deps.dir, seg));
    }

    // Pre-load sealed-segment registry first so chain-walk can recognize
    // already-sealed segments (avoid re-sealing).
    const sealedSet = new Set<string>(
      entries
        .filter((f) => f.startsWith('seg-') && f.endsWith('.sealed.json'))
        .map((f) => f.slice('seg-'.length, -'.sealed.json'.length)),
    );

    // Load sealed-segment records into memory registry for getLastSegment +
    // lastSegmentHash continuity.
    let highestSealedSeqEnd = -1;
    for (const segId of sealedSet) {
      const sealedPath = path.join(this.deps.dir, `seg-${segId}.sealed.json`);
      try {
        const raw = await fs.readFile(sealedPath, 'utf8');
        const segment = RecoverySegmentSchema.parse(JSON.parse(raw));
        this.segments.set(segId, segment);
        // Track most-recently-sealed for lastSegmentHash continuity (the
        // segment with the highest segment_seq_end is the chain tip).
        if (segment.segment_seq_end >= highestSealedSeqEnd) {
          highestSealedSeqEnd = segment.segment_seq_end;
          this.lastSegmentHash = segment.segment_hash;
        }
      } catch (err) {
        throw new Error(
          `failed to read sealed segment ${segId}: ${(err as Error).message}`,
        );
      }
    }

    // Phase 2 — chain-walk + corruption seal-and-restart per SUPV-SP9-009.
    // Exhaustive walk; on chain-break, seal corrupted segment + emit witness.
    // No skip+continue (per feedback_no_heuristic_bandaids.md rule 3).
    for (const seg of segmentFiles) {
      const segmentId = seg.slice('seg-'.length, -'.jsonl'.length);
      if (sealedSet.has(segmentId)) continue;

      const records = await this.loadJsonlRecords(
        path.join(this.deps.dir, seg),
      );

      let chainBroken = false;
      let breakIndex = -1;
      for (let i = 0; i < records.length; i++) {
        const curr = records[i]!;
        const prev = i > 0 ? records[i - 1]! : null;
        const expectedPrev = prev ? prev.event_hash : null;
        if (curr.prev_event_hash !== expectedPrev) {
          chainBroken = true;
          breakIndex = i;
          break;
        }
      }

      if (chainBroken) {
        await this.sealAsCorrupted(
          segmentId,
          `chain_break_at_record_${breakIndex}`,
        );
        sealedSet.add(segmentId);
      } else if (records.length > 0) {
        // Track the segment's last event_hash + max sequence for currentSegmentId
        // reconstruction below.
        const last = records[records.length - 1]!;
        if (last.sequence > this.nextSequence) {
          this.nextSequence = last.sequence;
          this.lastEventHash = last.event_hash;
        }
      }
    }

    // Phase 3 — currentSegmentId reconstruction per SDS-review N4. Find the
    // unsealed segment with the highest internal record sequence; if
    // multiple unsealed segments exist (a contract defect from a prior
    // multi-process or crash), seal all but the highest-sequence one as
    // 'orphan_unsealed_at_init' (RECOVERY-CORRUPT emission per
    // SUPV-SP9-009).
    const unsealedSegments = segmentFiles
      .map((f) => f.slice('seg-'.length, -'.jsonl'.length))
      .filter((id) => !sealedSet.has(id));

    if (unsealedSegments.length === 0) {
      this.currentSegmentId = null;
    } else if (unsealedSegments.length === 1) {
      const id = unsealedSegments[0]!;
      this.currentSegmentId = id;
      // Already populated nextSequence + lastEventHash above.
      void id;
    } else {
      const segmentMaxSequences = await Promise.all(
        unsealedSegments.map(async (id) => {
          const records = await this.loadJsonlRecords(
            path.join(this.deps.dir, `seg-${id}.jsonl`),
          );
          return {
            id,
            maxSeq: records[records.length - 1]?.sequence ?? 0,
            lastHash: records[records.length - 1]?.event_hash ?? null,
          };
        }),
      );
      segmentMaxSequences.sort((a, b) => b.maxSeq - a.maxSeq);
      const [winner, ...orphans] = segmentMaxSequences;
      for (const orphan of orphans) {
        await this.sealAsCorrupted(orphan.id, 'orphan_unsealed_at_init');
      }
      this.currentSegmentId = winner!.id;
      this.nextSequence = winner!.maxSeq;
      this.lastEventHash = winner!.lastHash;
    }
  }

  // ---------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------

  private segmentPath(segmentId: string): string {
    return path.join(this.deps.dir, `seg-${segmentId}.jsonl`);
  }

  private sealedPath(segmentId: string): string {
    return path.join(this.deps.dir, `seg-${segmentId}.sealed.json`);
  }

  /**
   * SUPV-SP9-007 — deterministic file-shape recovery. Locates the last `\n`
   * byte in the segment's tail (4 KiB window — sufficient for V1 record
   * sizes); truncates to `lastNewlineOffset + 1`. No content-pattern matching.
   */
  private async truncateIncompleteLine(segPath: string): Promise<void> {
    const stat = await fs.stat(segPath);
    if (stat.size === 0) return;
    const tailSize = Math.min(stat.size, 4096);
    const fd = await fs.open(segPath, 'r+');
    try {
      const buf = Buffer.alloc(tailSize);
      await fd.read(buf, 0, tailSize, stat.size - tailSize);
      const lastNewlineInTail = buf.lastIndexOf(0x0a); // '\n'
      if (lastNewlineInTail === -1) {
        if (tailSize === stat.size) {
          await fd.truncate(0);
          return;
        }
        throw new Error(
          `segment ${path.basename(segPath)} has a tail >4 KiB without a newline boundary`,
        );
      }
      const lastNewlineOffset = stat.size - tailSize + lastNewlineInTail;
      if (lastNewlineOffset + 1 !== stat.size) {
        await fd.truncate(lastNewlineOffset + 1);
      }
    } finally {
      await fd.close();
    }
  }

  /**
   * SUPV-SP9-008 — newline-delimited; one record per non-empty line;
   * structural-only validation (no Zod) per SUPV-SP9-020.
   */
  private async loadJsonlRecords(
    segPath: string,
  ): Promise<JsonlLedgerRecord[]> {
    let raw: string;
    try {
      raw = await fs.readFile(segPath, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    if (raw.length === 0) return [];
    const lines = raw.split('\n').filter((l) => l.length > 0);
    return lines.map((line) => JSON.parse(line) as JsonlLedgerRecord);
  }

  private async writeSealedSegmentFile(
    segmentId: string,
    segment: RecoverySegment,
  ): Promise<void> {
    // SUPV-SP9-001 — write-rename atomicity for the sealed-segment record.
    const sealedPath = this.sealedPath(segmentId);
    const tmpPath = `${sealedPath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(segment) + '\n', 'utf8');
    await fs.rename(tmpPath, sealedPath);
  }

  /**
   * SUPV-SP9-009 — seal-and-restart on chain-validation failure. Writes the
   * sealing record + final hash; updates internal registry; emits one witness
   * event with `'RECOVERY-CORRUPT'` (SUPV-SP9-018 single-emission per
   * surface). The corrupted segment is preserved for forensic inspection
   * (NOT deleted).
   */
  private async sealAsCorrupted(
    segmentId: string,
    reason: string,
  ): Promise<void> {
    const segPath = this.segmentPath(segmentId);
    const records = await this.loadJsonlRecords(segPath);

    const first = records[0];
    const last = records[records.length - 1];
    const segmentPayload = records.map((r) => r.event_hash).join('');
    const segmentHash = sha256(
      segmentPayload + (this.lastSegmentHash ?? '') + `corrupted:${reason}`,
    );

    const segment = RecoverySegmentSchema.parse({
      segment_id: segmentId,
      segment_seq_start: first?.sequence ?? 0,
      segment_seq_end: last?.sequence ?? 0,
      prev_segment_hash: this.lastSegmentHash,
      segment_hash: segmentHash,
      sealed_at: new Date().toISOString(),
    });

    await this.writeSealedSegmentFile(segmentId, segment);

    this.segments.set(segmentId, segment);
    this.lastSegmentHash = segmentHash;
    if (this.currentSegmentId === segmentId) {
      this.currentSegmentId = null;
    }

    // SUPV-SP9-009 + SUPV-SP9-018 — single witness emission per corruption
    // detection.
    await this.emitRecoveryWitness(
      'RECOVERY-CORRUPT',
      segmentId,
      reason,
      last?.project_id,
    );
  }

  /**
   * SUPV-SP9-010 + SUPV-SP9-018 + SUPV-SP9-019 — sole witness-emission
   * site for the disk-backed ledger. All `seal` and `sealAsCorrupted` paths
   * route through this helper; reviewer-verifiable single-emission per
   * surface via Phase E grep (`rg -n "deps.witness\?.appendInvariant" ...`
   * returns 1 match in this file). The route mirrors SP 8 SUPV-SP8-001
   * (`recovery-orchestrator.ts:218–236`); no new method on `IWitnessService`;
   * `event_type: 'fr_recovery_witness_emitted'` is the SOLE literal SP 9
   * emits per SUPV-SP9-016. `actionRef` is the segment_id (storage-layer
   * correlation key, distinct from the SP 8 `run_id` actionRef).
   */
  private async emitRecoveryWitness(
    code: 'RECOVERY-SEAL' | 'RECOVERY-CORRUPT',
    segmentId: string,
    reason: string,
    projectId: string | undefined,
  ): Promise<void> {
    if (!this.deps.witness) return;
    await this.deps.witness.appendInvariant({
      code: code as InvariantCode,
      actionCategory: 'recovery-evidence',
      actionRef: segmentId,
      // RecoveryCriticalEvent.project_id is `string` (SP 2 contract);
      // WitnessInvariantInput.projectId is the branded `ProjectId`. The cast
      // mirrors the SP 8 pattern at `recovery-orchestrator.ts:227`.
      projectId: (projectId ?? 'unknown') as ProjectId,
      actor: 'system',
      detail: {
        event_type: 'fr_recovery_witness_emitted',
        evidence_refs: [segmentId],
        reason,
      },
    });
  }
}
