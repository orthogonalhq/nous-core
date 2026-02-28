/**
 * In-memory recovery ledger store implementation.
 *
 * Phase 5.4 — Failure-Recovery Checkpoint, Retry, and Resume Governance.
 * Append-only segments with hash-chain integrity. Seal emits witness_ref.
 */
import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import type {
  RecoveryCriticalEvent,
  RecoverySegment,
  RecoveryCheckpoint,
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
