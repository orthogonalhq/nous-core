/**
 * Ingress trigger validator behavior tests.
 *
 * Phase 5.3 — Automation Gateway Ingress and Dispatch Admission.
 */
import { describe, it, expect } from 'vitest';
import { IngressTriggerValidator } from '../../ingress/trigger-validator.js';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const NOW = new Date().toISOString();

const validPayload = {
  trigger_id: UUID,
  trigger_type: 'scheduler',
  source_id: 'scheduler-1',
  project_id: UUID,
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
};

describe('IngressTriggerValidator', () => {
  it('validate() passes valid envelope', () => {
    const validator = new IngressTriggerValidator();
    const result = validator.validate(validPayload);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.envelope.project_id).toBe(UUID);
      expect(result.envelope.workflow_ref).toBe('workflow:test');
      expect(result.envelope.workmode_id).toBe('system:implementation');
    }
  });

  it('validate() rejects missing project_id', () => {
    const validator = new IngressTriggerValidator();
    const invalid = { ...validPayload, project_id: undefined };
    const result = validator.validate(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('invalid_envelope');
    }
  });

  it('validate() rejects missing workflow_ref', () => {
    const validator = new IngressTriggerValidator();
    const invalid = { ...validPayload, workflow_ref: '' };
    const result = validator.validate(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('invalid_envelope');
    }
  });

  it('validate() rejects unknown trigger_type', () => {
    const validator = new IngressTriggerValidator();
    const invalid = { ...validPayload, trigger_type: 'invalid' };
    const result = validator.validate(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('invalid_envelope');
    }
  });

  it('validate() rejects missing workmode_id', () => {
    const validator = new IngressTriggerValidator();
    const invalid = { ...validPayload, workmode_id: undefined };
    const result = validator.validate(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('invalid_envelope');
    }
  });
});
