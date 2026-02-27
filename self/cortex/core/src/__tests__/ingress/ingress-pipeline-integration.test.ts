/**
 * Ingress pipeline integration test.
 *
 * Phase 5.3 — End-to-end flow: Validator → AuthnVerifier → AuthzEvaluator
 * → IdempotencyStore → DispatchAdmission with mocked IOpctlService.
 */
import { describe, it, expect } from 'vitest';
import {
  IngressTriggerValidator,
  IngressAuthnVerifier,
  IngressAuthzEvaluator,
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

describe('Ingress pipeline integration', () => {
  it('full pipeline: valid scheduler trigger → accepted_dispatched', async () => {
    const validator = new IngressTriggerValidator();
    const authn = new IngressAuthnVerifier();
    const authz = new IngressAuthzEvaluator();
    const idempotencyStore = new InMemoryIngressIdempotencyStore();
    const opctl: IOpctlService = {
      getProjectControlState: async () => 'running',
    } as unknown as IOpctlService;
    const admission = new IngressDispatchAdmission({
      opctl,
      idempotencyStore,
    });

    const payload = makeEnvelope({});
    const validation = validator.validate(payload);
    expect(validation.valid).toBe(true);
    if (!validation.valid) return;
    const envelope = validation.envelope;

    const authnResult = await authn.verify(envelope);
    expect(authnResult.authenticated).toBe(true);
    if (!authnResult.authenticated) return;

    const authzResult = await authz.evaluate(
      envelope,
      authnResult.auth_context_ref,
    );
    expect(authzResult.allowed).toBe(true);
    if (!authzResult.allowed) return;

    const idempotencyResult = await idempotencyStore.recordAndCheck(envelope);
    expect(idempotencyResult.status).toBe('new');
    if (idempotencyResult.status === 'replay') return;

    const outcome = await admission.admit(envelope, idempotencyResult);
    expect(outcome.outcome).toBe('accepted_dispatched');
    if (outcome.outcome === 'accepted_dispatched') {
      expect(outcome.run_id).toBeDefined();
      expect(outcome.evidence_ref).toBeDefined();
    }
  });

  it('full pipeline: duplicate trigger → accepted_already_dispatched', async () => {
    const validator = new IngressTriggerValidator();
    const authn = new IngressAuthnVerifier();
    const authz = new IngressAuthzEvaluator();
    const idempotencyStore = new InMemoryIngressIdempotencyStore();
    const opctl: IOpctlService = {
      getProjectControlState: async () => 'running',
    } as unknown as IOpctlService;
    const admission = new IngressDispatchAdmission({
      opctl,
      idempotencyStore,
    });

    const payload = makeEnvelope({ source_id: 's1', idempotency_key: 'k1' });
    const validation = validator.validate(payload);
    expect(validation.valid).toBe(true);
    if (!validation.valid) return;
    const envelope = validation.envelope;

    await authn.verify(envelope);
    const authzResult = await authz.evaluate(envelope, 'internal:s1:1');
    expect(authzResult.allowed).toBe(true);

    const firstCheck = await idempotencyStore.recordAndCheck(envelope);
    expect(firstCheck.status).toBe('new');
    const firstOutcome = await admission.admit(envelope, firstCheck);
    expect(firstOutcome.outcome).toBe('accepted_dispatched');
    const runId =
      firstOutcome.outcome === 'accepted_dispatched'
        ? firstOutcome.run_id
        : null;

    const secondCheck = await idempotencyStore.recordAndCheck(envelope);
    expect(secondCheck.status).toBe('duplicate');
    const secondOutcome = await admission.admit(envelope, secondCheck);
    expect(secondOutcome.outcome).toBe('accepted_already_dispatched');
    if (secondOutcome.outcome === 'accepted_already_dispatched') {
      expect(secondOutcome.run_id).toBe(runId);
    }
  });

  it('full pipeline: invalid envelope → validation rejects', () => {
    const validator = new IngressTriggerValidator();
    const payload = makeEnvelope({ project_id: undefined as unknown as string });
    const validation = validator.validate(payload);
    expect(validation.valid).toBe(false);
    if (!validation.valid) {
      expect(validation.reason).toBe('invalid_envelope');
    }
  });
});
