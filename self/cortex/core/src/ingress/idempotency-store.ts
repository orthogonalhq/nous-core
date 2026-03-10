/**
 * In-memory ingress idempotency store implementation.
 *
 * Phase 9.3 upgrades the earlier "record after dispatch" posture into a
 * reservation-based claim/commit/release lifecycle so duplicate first-seen
 * triggers do not create second-run side effects.
 */
import { randomUUID } from 'node:crypto';
import type {
  IngressIdempotencyClaimResult,
  IngressTriggerEnvelope,
  WorkflowExecutionId,
} from '@nous/shared';
import type { IIngressIdempotencyStore } from '@nous/shared';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_REPLAY_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_PENDING_CLAIM_WAIT_MS = 25;

interface ClaimedRecord {
  status: 'claimed';
  reservation_id: string;
  run_id: WorkflowExecutionId;
  recorded_at: number;
  dispatch_ref?: string;
  evidence_ref?: string;
}

interface CommittedRecord {
  status: 'committed';
  reservation_id: string;
  run_id: WorkflowExecutionId;
  dispatch_ref: string;
  evidence_ref: string;
  recorded_at: number;
}

type DedupRecord = ClaimedRecord | CommittedRecord;

export interface IngressIdempotencyStoreOptions {
  ttlMs?: number;
  replayWindowMs?: number;
  pendingClaimWaitMs?: number;
  now?: () => number;
}

export class InMemoryIngressIdempotencyStore implements IIngressIdempotencyStore {
  private readonly dedup = new Map<string, DedupRecord>();
  private readonly reservations = new Map<string, string>();
  private readonly nonces = new Map<string, Array<{ nonce: string; recorded_at: number }>>();
  private readonly ttlMs: number;
  private readonly replayWindowMs: number;
  private readonly pendingClaimWaitMs: number;
  private readonly now: () => number;

  constructor(options: IngressIdempotencyStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.replayWindowMs = options.replayWindowMs ?? DEFAULT_REPLAY_WINDOW_MS;
    this.pendingClaimWaitMs =
      options.pendingClaimWaitMs ?? DEFAULT_PENDING_CLAIM_WAIT_MS;
    this.now = options.now ?? (() => Date.now());
  }

  private dedupKey(envelope: IngressTriggerEnvelope): string {
    return `${envelope.source_id}:${envelope.idempotency_key}`;
  }

  private nonceKey(envelope: IngressTriggerEnvelope): string {
    return envelope.source_id;
  }

  private pruneExpired(): void {
    const now = this.now();

    for (const [key, record] of this.dedup.entries()) {
      if (now - record.recorded_at > this.ttlMs) {
        this.dedup.delete(key);
        this.reservations.delete(record.reservation_id);
      }
    }

    for (const [key, list] of this.nonces.entries()) {
      const kept = list.filter((item) => now - item.recorded_at <= this.replayWindowMs);
      if (kept.length === 0) {
        this.nonces.delete(key);
      } else {
        this.nonces.set(key, kept);
      }
    }
  }

  private toDuplicateResult(record: DedupRecord): IngressIdempotencyClaimResult {
    return {
      status: 'duplicate',
      run_id: record.run_id,
      dispatch_ref: record.dispatch_ref ?? `dispatch:${record.run_id}`,
      evidence_ref: record.evidence_ref ?? `evidence:${record.run_id}`,
    };
  }

  private async waitForCommittedDuplicate(
    key: string,
    record: DedupRecord,
  ): Promise<IngressIdempotencyClaimResult> {
    const waitUntil = this.now() + this.pendingClaimWaitMs;

    while (record.status === 'claimed' && this.now() < waitUntil) {
      await new Promise((resolve) => setTimeout(resolve, 1));
      const latest = this.dedup.get(key);
      if (!latest) {
        break;
      }
      record = latest;
      if (record.status === 'committed') {
        return this.toDuplicateResult(record);
      }
    }

    return this.toDuplicateResult(record);
  }

  async claim(
    envelope: IngressTriggerEnvelope,
  ): Promise<IngressIdempotencyClaimResult> {
    this.pruneExpired();

    const key = this.dedupKey(envelope);
    const existing = this.dedup.get(key);
    if (existing) {
      return this.waitForCommittedDuplicate(key, existing);
    }

    const occurredAt = new Date(envelope.occurred_at).getTime();
    const now = this.now();
    if (Math.abs(now - occurredAt) > this.replayWindowMs) {
      return { status: 'replay' };
    }

    const nonceKey = this.nonceKey(envelope);
    const nonceList = this.nonces.get(nonceKey) ?? [];
    if (nonceList.some((record) => record.nonce === envelope.nonce)) {
      return { status: 'replay' };
    }

    nonceList.push({ nonce: envelope.nonce, recorded_at: now });
    this.nonces.set(nonceKey, nonceList);

    const reservationId = randomUUID();
    const runId = randomUUID() as WorkflowExecutionId;
    const claimedRecord: ClaimedRecord = {
      status: 'claimed',
      reservation_id: reservationId,
      run_id: runId,
      recorded_at: now,
    };

    this.dedup.set(key, claimedRecord);
    this.reservations.set(reservationId, key);

    return {
      status: 'claimed',
      reservation_id: reservationId,
      run_id: runId,
      recorded_at: new Date(now).toISOString(),
    };
  }

  async commitDispatch(
    reservationId: string,
    dispatchRef: string,
    evidenceRef: string,
  ): Promise<void> {
    const key = this.reservations.get(reservationId);
    if (!key) {
      return;
    }

    const existing = this.dedup.get(key);
    if (!existing || existing.reservation_id !== reservationId) {
      return;
    }

    this.dedup.set(key, {
      status: 'committed',
      reservation_id: reservationId,
      run_id: existing.run_id,
      dispatch_ref: dispatchRef,
      evidence_ref: evidenceRef,
      recorded_at: existing.recorded_at,
    });
  }

  async releaseClaim(
    reservationId: string,
    _reasonCode: string,
  ): Promise<void> {
    const key = this.reservations.get(reservationId);
    if (!key) {
      return;
    }

    const existing = this.dedup.get(key);
    if (existing?.reservation_id === reservationId && existing.status === 'claimed') {
      this.dedup.delete(key);
    }

    this.reservations.delete(reservationId);
  }
}
