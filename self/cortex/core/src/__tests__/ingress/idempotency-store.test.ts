/**
 * Ingress idempotency store behavior tests.
 *
 * Phase 5.3 — Automation Gateway Ingress and Dispatch Admission.
 */
import { describe, it, expect } from 'vitest';
import {
  InMemoryIngressIdempotencyStore,
} from '../../ingress/idempotency-store.js';
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
    event_name: 'scheduled_run',
    payload_ref: 'sha256:' + 'a'.repeat(64),
    idempotency_key: 'key-1',
    nonce: 'nonce-1',
    occurred_at: NOW,
    received_at: NOW,
    auth_context_ref: null,
    trace_parent: null,
    ...overrides,
  };
}

describe('InMemoryIngressIdempotencyStore', () => {
  it('recordAndCheck() returns new for first-seen', async () => {
    const store = new InMemoryIngressIdempotencyStore();
    const envelope = makeEnvelope({});
    const result = await store.recordAndCheck(envelope);
    expect(result.status).toBe('new');
  });

  it('recordAndCheck() returns duplicate after recordDispatch', async () => {
    const store = new InMemoryIngressIdempotencyStore();
    const envelope = makeEnvelope({ source_id: 's1', idempotency_key: 'k1' });
    const first = await store.recordAndCheck(envelope);
    expect(first.status).toBe('new');

    await store.recordDispatch(envelope, 'run-1', 'dispatch-1', 'evidence-1');
    const second = await store.recordAndCheck(envelope);
    expect(second.status).toBe('duplicate');
    if (second.status === 'duplicate') {
      expect(second.run_id).toBe('run-1');
      expect(second.dispatch_ref).toBe('dispatch-1');
      expect(second.evidence_ref).toBe('evidence-1');
    }
  });

  it('recordAndCheck() returns replay for stale timestamp', async () => {
    const store = new InMemoryIngressIdempotencyStore({
      replayWindowMs: 1000,
    });
    const oldDate = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const envelope = makeEnvelope({
      occurred_at: oldDate,
      received_at: oldDate,
      nonce: 'unique-nonce-1',
    });
    const result = await store.recordAndCheck(envelope);
    expect(result.status).toBe('replay');
  });

  it('recordAndCheck() returns replay for duplicate nonce', async () => {
    const store = new InMemoryIngressIdempotencyStore();
    const envelope1 = makeEnvelope({
      source_id: 's1',
      idempotency_key: 'k1',
      nonce: 'n1',
    });
    const envelope2 = makeEnvelope({
      source_id: 's1',
      idempotency_key: 'k2',
      nonce: 'n1',
    });
    const first = await store.recordAndCheck(envelope1);
    expect(first.status).toBe('new');
    const second = await store.recordAndCheck(envelope2);
    expect(second.status).toBe('replay');
  });
});
