/**
 * Ingress dispatch admission behavior tests.
 *
 * Phase 5.3 — Automation Gateway Ingress and Dispatch Admission.
 */
import { describe, it, expect } from 'vitest';
import {
  IngressDispatchAdmission,
  InMemoryIngressIdempotencyStore,
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

describe('IngressDispatchAdmission', () => {
  it('admit() returns accepted_already_dispatched for duplicate', async () => {
    const store = new InMemoryIngressIdempotencyStore();
    const envelope = makeEnvelope({});
    await store.recordDispatch(envelope, 'run-1', 'dispatch-1', 'evidence-1');

    const admission = new IngressDispatchAdmission({
      opctl: null,
      idempotencyStore: store,
    });
    const result = await admission.admit(envelope, {
      status: 'duplicate',
      run_id: 'run-1',
      dispatch_ref: 'dispatch-1',
      evidence_ref: 'evidence-1',
    });
    expect(result.outcome).toBe('accepted_already_dispatched');
    if (result.outcome === 'accepted_already_dispatched') {
      expect(result.run_id).toBe('run-1');
    }
  });

  it('admit() returns rejected with control_state_blocked when opctl absent', async () => {
    const store = new InMemoryIngressIdempotencyStore();
    const admission = new IngressDispatchAdmission({
      opctl: null,
      idempotencyStore: store,
    });
    const envelope = makeEnvelope({});
    const result = await admission.admit(envelope, { status: 'new' });
    expect(result.outcome).toBe('rejected');
    if (result.outcome === 'rejected') {
      expect(result.reason).toBe('control_state_blocked');
    }
  });

  it('admit() returns rejected when control state hard_stopped', async () => {
    const opctl: IOpctlService = {
      getProjectControlState: async () => 'hard_stopped',
    } as unknown as IOpctlService;
    const store = new InMemoryIngressIdempotencyStore();
    const admission = new IngressDispatchAdmission({
      opctl,
      idempotencyStore: store,
    });
    const envelope = makeEnvelope({});
    const result = await admission.admit(envelope, { status: 'new' });
    expect(result.outcome).toBe('rejected');
    if (result.outcome === 'rejected') {
      expect(result.reason).toBe('control_state_blocked');
    }
  });

  it('admit() returns accepted_dispatched when control state running', async () => {
    const opctl: IOpctlService = {
      getProjectControlState: async () => 'running',
    } as unknown as IOpctlService;
    const store = new InMemoryIngressIdempotencyStore();
    const admission = new IngressDispatchAdmission({
      opctl,
      idempotencyStore: store,
    });
    const envelope = makeEnvelope({});
    const result = await admission.admit(envelope, { status: 'new' });
    expect(result.outcome).toBe('accepted_dispatched');
    if (result.outcome === 'accepted_dispatched') {
      expect(result.run_id).toBeDefined();
      expect(result.dispatch_ref).toBeDefined();
      expect(result.evidence_ref).toBeDefined();
    }
  });

  it('admit() returns rejected with replay_detected for replay status', async () => {
    const store = new InMemoryIngressIdempotencyStore();
    const admission = new IngressDispatchAdmission({
      opctl: null,
      idempotencyStore: store,
    });
    const envelope = makeEnvelope({});
    const result = await admission.admit(envelope, { status: 'replay' });
    expect(result.outcome).toBe('rejected');
    if (result.outcome === 'rejected') {
      expect(result.reason).toBe('replay_detected');
    }
  });
});
