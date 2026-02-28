/**
 * Phase 5.3 ingress adversarial tests.
 *
 * V1 Success Criteria:
 * - 0 successful replay attacks
 * - 100% duplicate idempotent: same source_id+idempotency_key never creates second run
 */
import { describe, it, expect } from 'vitest';
import {
  InMemoryIngressIdempotencyStore,
  IngressDispatchAdmission,
} from '../../ingress/index.js';
import type { IngressTriggerEnvelope } from '@nous/shared';
import type { IOpctlService } from '@nous/shared';

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

describe('Phase 5.3 ingress adversarial', () => {
  describe('0 successful replay attacks', () => {
    it('rejects replay with stale timestamp', async () => {
      const store = new InMemoryIngressIdempotencyStore({
        replayWindowMs: 60 * 1000,
      });
      const staleDate = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const envelope = makeEnvelope({
        occurred_at: staleDate,
        received_at: staleDate,
        nonce: 'unique-replay-1',
      });
      const result = await store.recordAndCheck(envelope);
      expect(result.status).toBe('replay');
    });

    it('rejects replay with duplicate nonce within source', async () => {
      const store = new InMemoryIngressIdempotencyStore();
      const env1 = makeEnvelope({
        source_id: 'attacker',
        idempotency_key: 'k1',
        nonce: 'reused-nonce',
      });
      const env2 = makeEnvelope({
        source_id: 'attacker',
        idempotency_key: 'k2',
        nonce: 'reused-nonce',
      });
      const first = await store.recordAndCheck(env1);
      expect(first.status).toBe('new');
      const second = await store.recordAndCheck(env2);
      expect(second.status).toBe('replay');
    });

    it('rejects reordered replay (same idempotency_key, different nonce)', async () => {
      const store = new InMemoryIngressIdempotencyStore();
      const opctl: IOpctlService = {
        getProjectControlState: async () => 'running',
      } as unknown as IOpctlService;
      const admission = new IngressDispatchAdmission({
        opctl,
        idempotencyStore: store,
      });

      const env1 = makeEnvelope({
        source_id: 's1',
        idempotency_key: 'same-key',
        nonce: 'n1',
      });
      const env2 = makeEnvelope({
        source_id: 's1',
        idempotency_key: 'same-key',
        nonce: 'n2',
      });

      const firstCheck = await store.recordAndCheck(env1);
      expect(firstCheck.status).toBe('new');
      const firstAdmit = await admission.admit(env1, firstCheck);
      expect(firstAdmit.outcome).toBe('accepted_dispatched');

      const secondCheck = await store.recordAndCheck(env2);
      expect(secondCheck.status).toBe('duplicate');
      const secondAdmit = await admission.admit(env2, secondCheck);
      expect(secondAdmit.outcome).toBe('accepted_already_dispatched');
      if (secondAdmit.outcome === 'accepted_already_dispatched') {
        expect(secondAdmit.run_id).toBe(
          (firstAdmit as { run_id: string }).run_id,
        );
      }
    });
  });

  describe('100% duplicate idempotent', () => {
    it('same source_id+idempotency_key never creates second run', async () => {
      const store = new InMemoryIngressIdempotencyStore();
      const opctl: IOpctlService = {
        getProjectControlState: async () => 'running',
      } as unknown as IOpctlService;
      const admission = new IngressDispatchAdmission({
        opctl,
        idempotencyStore: store,
      });

      const envelope = makeEnvelope({
        source_id: 'dup-source',
        idempotency_key: 'dup-key',
        nonce: 'n1',
      });

      const check1 = await store.recordAndCheck(envelope);
      expect(check1.status).toBe('new');
      const result1 = await admission.admit(envelope, check1);
      expect(result1.outcome).toBe('accepted_dispatched');
      const runId1 =
        result1.outcome === 'accepted_dispatched' ? result1.run_id : null;

      const check2 = await store.recordAndCheck(envelope);
      expect(check2.status).toBe('duplicate');
      const result2 = await admission.admit(envelope, check2);
      expect(result2.outcome).toBe('accepted_already_dispatched');
      if (result2.outcome === 'accepted_already_dispatched') {
        expect(result2.run_id).toBe(runId1);
      }
    });
  });
});
