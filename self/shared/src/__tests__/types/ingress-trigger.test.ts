/**
 * Ingress trigger schema contract tests.
 *
 * Phase 5.3 — Automation Gateway Ingress and Dispatch Admission.
 */
import { describe, it, expect } from 'vitest';
import {
  IngressTriggerTypeSchema,
  IngressDeliveryModeSchema,
  IngressTriggerEnvelopeSchema,
  PAYLOAD_REF_SHA256_REGEX,
} from '../../types/ingress-trigger.js';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const NOW = new Date().toISOString();

describe('IngressTriggerTypeSchema', () => {
  it('accepts all trigger types', () => {
    expect(IngressTriggerTypeSchema.safeParse('scheduler').success).toBe(true);
    expect(IngressTriggerTypeSchema.safeParse('hook').success).toBe(true);
    expect(IngressTriggerTypeSchema.safeParse('webhook').success).toBe(true);
    expect(IngressTriggerTypeSchema.safeParse('system_event').success).toBe(true);
  });

  it('rejects invalid trigger type', () => {
    expect(IngressTriggerTypeSchema.safeParse('invalid').success).toBe(false);
  });
});

describe('IngressDeliveryModeSchema', () => {
  it('accepts all delivery modes', () => {
    expect(IngressDeliveryModeSchema.safeParse('none').success).toBe(true);
    expect(IngressDeliveryModeSchema.safeParse('announce').success).toBe(true);
    expect(IngressDeliveryModeSchema.safeParse('webhook_callback').success).toBe(
      true,
    );
  });
});

describe('IngressTriggerEnvelopeSchema', () => {
  const validEnvelope = {
    trigger_id: UUID,
    trigger_type: 'scheduler' as const,
    source_id: 'scheduler-1',
    project_id: UUID,
    workflow_ref: 'workflow:test',
    event_name: 'scheduled_run',
    payload_ref: 'sha256:' + 'a'.repeat(64),
    idempotency_key: 'key-1',
    nonce: 'nonce-1',
    occurred_at: NOW,
    received_at: NOW,
    auth_context_ref: null,
    trace_parent: null,
  };

  it('parses valid envelope with all required fields', () => {
    const result = IngressTriggerEnvelopeSchema.safeParse(validEnvelope);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.project_id).toBe(UUID);
      expect(result.data.workflow_ref).toBe('workflow:test');
      expect(result.data.requested_delivery_mode).toBe('none');
    }
  });

  it('rejects missing project_id', () => {
    const invalid = { ...validEnvelope, project_id: undefined };
    expect(IngressTriggerEnvelopeSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects missing workflow_ref', () => {
    const invalid = { ...validEnvelope, workflow_ref: '' };
    expect(IngressTriggerEnvelopeSchema.safeParse(invalid).success).toBe(false);
  });

  it('accepts payload_ref in sha256:hex format', () => {
    const withPayload = { ...validEnvelope, payload_ref: 'sha256:' + 'b'.repeat(64) };
    expect(IngressTriggerEnvelopeSchema.safeParse(withPayload).success).toBe(true);
  });

  it('accepts any non-empty payload_ref (schema allows)', () => {
    const withPayload = { ...validEnvelope, payload_ref: 'custom-ref' };
    expect(IngressTriggerEnvelopeSchema.safeParse(withPayload).success).toBe(true);
  });
});

describe('PAYLOAD_REF_SHA256_REGEX', () => {
  it('matches valid sha256:hex format', () => {
    expect(PAYLOAD_REF_SHA256_REGEX.test('sha256:' + 'a'.repeat(64))).toBe(true);
    expect(PAYLOAD_REF_SHA256_REGEX.test('sha256:' + 'f'.repeat(64))).toBe(true);
  });

  it('rejects invalid format', () => {
    expect(PAYLOAD_REF_SHA256_REGEX.test('sha256:' + 'a'.repeat(63))).toBe(false);
    expect(PAYLOAD_REF_SHA256_REGEX.test('sha256:xyz')).toBe(false);
    expect(PAYLOAD_REF_SHA256_REGEX.test('md5:abc')).toBe(false);
  });
});
