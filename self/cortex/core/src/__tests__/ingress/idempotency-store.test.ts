/**
 * Ingress idempotency store behavior tests.
 */
import { describe, expect, it } from 'vitest';
import { InMemoryIngressIdempotencyStore } from '../../ingress/idempotency-store.js';
import type { IngressTriggerEnvelope } from '@nous/shared';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const NOW = new Date().toISOString();

function makeEnvelope(
  overrides: Partial<IngressTriggerEnvelope>,
): IngressTriggerEnvelope {
  return {
    trigger_id: UUID,
    trigger_type: 'scheduler',
    source_id: 'scheduler-1',
    project_id: UUID as import('@nous/shared').ProjectId,
    workflow_ref: 'workflow:test',
    workmode_id: 'system:implementation',
    event_name: 'scheduled_run',
    payload_ref: `sha256:${'a'.repeat(64)}`,
    idempotency_key: 'key-1',
    nonce: 'nonce-1',
    occurred_at: NOW,
    received_at: NOW,
    auth_context_ref: null,
    trace_parent: null,
    requested_delivery_mode: 'none',
    ...overrides,
  };
}

describe('InMemoryIngressIdempotencyStore', () => {
  it('claim() returns claimed for first-seen input', async () => {
    const store = new InMemoryIngressIdempotencyStore();
    const result = await store.claim(makeEnvelope({}));
    expect(result.status).toBe('claimed');
    if (result.status === 'claimed') {
      expect(result.reservation_id).toBeDefined();
      expect(result.run_id).toBeDefined();
    }
  });

  it('claim() returns duplicate after commitDispatch()', async () => {
    const store = new InMemoryIngressIdempotencyStore();
    const envelope = makeEnvelope({ source_id: 'duplicate', idempotency_key: 'k1' });
    const first = await store.claim(envelope);
    expect(first.status).toBe('claimed');
    if (first.status !== 'claimed') {
      return;
    }

    await store.commitDispatch(first.reservation_id, 'dispatch-1', 'evidence-1');

    const second = await store.claim(envelope);
    expect(second.status).toBe('duplicate');
    if (second.status === 'duplicate') {
      expect(second.run_id).toBe(first.run_id);
      expect(second.dispatch_ref).toBe('dispatch-1');
      expect(second.evidence_ref).toBe('evidence-1');
    }
  });

  it('claim() returns replay for stale timestamp', async () => {
    const store = new InMemoryIngressIdempotencyStore({ replayWindowMs: 1000 });
    const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const result = await store.claim(
      makeEnvelope({
        occurred_at: stale,
        received_at: stale,
        nonce: 'unique-nonce',
      }),
    );
    expect(result.status).toBe('replay');
  });

  it('claim() returns replay for duplicate nonce', async () => {
    const store = new InMemoryIngressIdempotencyStore();
    const first = await store.claim(
      makeEnvelope({
        source_id: 'same-source',
        idempotency_key: 'k1',
        nonce: 'dup-nonce',
      }),
    );
    expect(first.status).toBe('claimed');

    const second = await store.claim(
      makeEnvelope({
        source_id: 'same-source',
        idempotency_key: 'k2',
        nonce: 'dup-nonce',
      }),
    );
    expect(second.status).toBe('replay');
  });

  it('releaseClaim() frees a claim for a later retry with a fresh nonce', async () => {
    const store = new InMemoryIngressIdempotencyStore();
    const envelope = makeEnvelope({
      source_id: 'release-test',
      idempotency_key: 'release-key',
    });
    const first = await store.claim(envelope);
    expect(first.status).toBe('claimed');
    if (first.status !== 'claimed') {
      return;
    }

    await store.releaseClaim(first.reservation_id, 'workflow_admission_blocked');

    const retry = await store.claim({
      ...envelope,
      nonce: 'nonce-2',
    });
    expect(retry.status).toBe('claimed');
  });
});
