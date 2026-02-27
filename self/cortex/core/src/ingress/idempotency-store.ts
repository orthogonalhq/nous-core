/**
 * In-memory ingress idempotency store implementation.
 *
 * Phase 5.3 — Automation Gateway Ingress and Dispatch Admission.
 * Dedup identity: source_id + idempotency_key. TTL default 24h.
 * Replay window: +/- 5 minutes for timestamp.
 */
import type {
  IngressTriggerEnvelope,
  IngressIdempotencyCheckResult,
} from '@nous/shared';
import type { IIngressIdempotencyStore } from '@nous/shared';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const DEFAULT_REPLAY_WINDOW_MS = 5 * 60 * 1000; // +/- 5 min

interface DedupRecord {
  run_id: string;
  dispatch_ref: string;
  evidence_ref: string;
  recorded_at: number;
}

interface NonceRecord {
  nonce: string;
  recorded_at: number;
}

export interface IngressIdempotencyStoreOptions {
  ttlMs?: number;
  replayWindowMs?: number;
}

export class InMemoryIngressIdempotencyStore implements IIngressIdempotencyStore {
  private readonly dedup = new Map<string, DedupRecord>();
  private readonly nonces = new Map<string, NonceRecord[]>();
  private readonly ttlMs: number;
  private readonly replayWindowMs: number;

  constructor(options: IngressIdempotencyStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.replayWindowMs = options.replayWindowMs ?? DEFAULT_REPLAY_WINDOW_MS;
  }

  private dedupKey(envelope: IngressTriggerEnvelope): string {
    return `${envelope.source_id}:${envelope.idempotency_key}`;
  }

  private nonceKey(envelope: IngressTriggerEnvelope): string {
    return envelope.source_id;
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [k, v] of this.dedup.entries()) {
      if (now - v.recorded_at > this.ttlMs) this.dedup.delete(k);
    }
    for (const [k, list] of this.nonces.entries()) {
      const kept = list.filter((r) => now - r.recorded_at <= this.replayWindowMs);
      if (kept.length === 0) this.nonces.delete(k);
      else this.nonces.set(k, kept);
    }
  }

  async recordAndCheck(
    envelope: IngressTriggerEnvelope,
  ): Promise<IngressIdempotencyCheckResult> {
    this.pruneExpired();

    const key = this.dedupKey(envelope);
    const existing = this.dedup.get(key);
    if (existing) {
      return {
        status: 'duplicate',
        run_id: existing.run_id,
        dispatch_ref: existing.dispatch_ref,
        evidence_ref: existing.evidence_ref,
      };
    }

    // Replay check: timestamp within window, nonce unique
    const occurredAt = new Date(envelope.occurred_at).getTime();
    const now = Date.now();
    if (Math.abs(now - occurredAt) > this.replayWindowMs) {
      return { status: 'replay' };
    }

    const nonceKey = this.nonceKey(envelope);
    const nonceList = this.nonces.get(nonceKey) ?? [];
    if (nonceList.some((r) => r.nonce === envelope.nonce)) {
      return { status: 'replay' };
    }
    nonceList.push({ nonce: envelope.nonce, recorded_at: now });
    this.nonces.set(nonceKey, nonceList);

    return { status: 'new' };
  }

  async recordDispatch(
    envelope: IngressTriggerEnvelope,
    run_id: string,
    dispatch_ref: string,
    evidence_ref: string,
  ): Promise<void> {
    const key = this.dedupKey(envelope);
    this.dedup.set(key, {
      run_id,
      dispatch_ref,
      evidence_ref,
      recorded_at: Date.now(),
    });
  }
}
