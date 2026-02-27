/**
 * Ingress authn verifier behavior tests.
 *
 * Phase 5.3 — Automation Gateway Ingress and Dispatch Admission.
 */
import { describe, it, expect } from 'vitest';
import { IngressAuthnVerifier } from '../../ingress/authn-verifier.js';
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

describe('IngressAuthnVerifier', () => {
  it('verify() passes for scheduler trigger', async () => {
    const verifier = new IngressAuthnVerifier();
    const envelope = makeEnvelope({ trigger_type: 'scheduler' });
    const result = await verifier.verify(envelope);
    expect(result.authenticated).toBe(true);
    if (result.authenticated) {
      expect(result.auth_context_ref).toContain('internal');
    }
  });

  it('verify() passes for hook trigger', async () => {
    const verifier = new IngressAuthnVerifier();
    const envelope = makeEnvelope({ trigger_type: 'hook' });
    const result = await verifier.verify(envelope);
    expect(result.authenticated).toBe(true);
  });

  it('verify() passes for webhook when auth_context_ref present', async () => {
    const verifier = new IngressAuthnVerifier();
    const envelope = makeEnvelope({
      trigger_type: 'webhook',
      auth_context_ref: 'webhook:key-1:verified',
    });
    const result = await verifier.verify(envelope);
    expect(result.authenticated).toBe(true);
    if (result.authenticated) {
      expect(result.auth_context_ref).toBe('webhook:key-1:verified');
    }
  });

  it('verify() rejects webhook when auth_context_ref absent', async () => {
    const verifier = new IngressAuthnVerifier();
    const envelope = makeEnvelope({
      trigger_type: 'webhook',
      auth_context_ref: null,
    });
    const result = await verifier.verify(envelope);
    expect(result.authenticated).toBe(false);
    if (!result.authenticated) {
      expect(result.reason).toBe('unauthenticated');
    }
  });
});
