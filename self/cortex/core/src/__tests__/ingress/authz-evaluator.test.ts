/**
 * Ingress authz evaluator behavior tests.
 *
 * Phase 5.3 — Automation Gateway Ingress and Dispatch Admission.
 */
import { describe, it, expect } from 'vitest';
import { IngressAuthzEvaluator } from '../../ingress/authz-evaluator.js';
import type { IngressTriggerEnvelope, IngressCredentialScope } from '@nous/shared';

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

describe('IngressAuthzEvaluator', () => {
  it('evaluate() allows scheduler when no policy block', async () => {
    const evaluator = new IngressAuthzEvaluator();
    const envelope = makeEnvelope({ trigger_type: 'scheduler' });
    const result = await evaluator.evaluate(envelope, 'internal:sched:1');
    expect(result.allowed).toBe(true);
  });

  it('evaluate() denies webhook when credentialScopes absent', async () => {
    const evaluator = new IngressAuthzEvaluator({});
    const envelope = makeEnvelope({
      trigger_type: 'webhook',
      auth_context_ref: 'webhook:key-1:verified',
    });
    const result = await evaluator.evaluate(envelope, 'webhook:key-1:verified');
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe('policy_blocked');
    }
  });

  it('evaluate() allows webhook when scope matches', async () => {
    const scope: IngressCredentialScope = {
      project_id: UUID as import('@nous/shared').ProjectId,
      workflow_ref: 'workflow:test',
      allowed_event_names: ['scheduled_run'],
      key_id: 'key-1',
    };
    const scopes = new Map<string, IngressCredentialScope>([['key-1', scope]]);
    const evaluator = new IngressAuthzEvaluator({ credentialScopes: scopes });
    const envelope = makeEnvelope({
      trigger_type: 'webhook',
      auth_context_ref: 'webhook:key-1:verified',
    });
    const result = await evaluator.evaluate(envelope, 'webhook:key-1:verified');
    expect(result.allowed).toBe(true);
  });

  it('evaluate() denies with scope_mismatch when project_id mismatch', async () => {
    const scope: IngressCredentialScope = {
      project_id: '660e8400-e29b-41d4-a716-446655440001' as import('@nous/shared').ProjectId,
      workflow_ref: 'workflow:test',
      allowed_event_names: ['scheduled_run'],
      key_id: 'key-1',
    };
    const scopes = new Map<string, IngressCredentialScope>([['key-1', scope]]);
    const evaluator = new IngressAuthzEvaluator({ credentialScopes: scopes });
    const envelope = makeEnvelope({
      trigger_type: 'webhook',
      auth_context_ref: 'webhook:key-1:verified',
    });
    const result = await evaluator.evaluate(envelope, 'webhook:key-1:verified');
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe('scope_mismatch');
    }
  });

  it('evaluate() denies with event_forbidden when event not in allowlist', async () => {
    const scope: IngressCredentialScope = {
      project_id: UUID as import('@nous/shared').ProjectId,
      workflow_ref: 'workflow:test',
      allowed_event_names: ['other_event'],
      key_id: 'key-1',
    };
    const scopes = new Map<string, IngressCredentialScope>([['key-1', scope]]);
    const evaluator = new IngressAuthzEvaluator({ credentialScopes: scopes });
    const envelope = makeEnvelope({
      trigger_type: 'webhook',
      event_name: 'scheduled_run',
      auth_context_ref: 'webhook:key-1:verified',
    });
    const result = await evaluator.evaluate(envelope, 'webhook:key-1:verified');
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe('event_forbidden');
    }
  });
});
