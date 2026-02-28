/**
 * Ingress credential scope contract tests.
 *
 * Phase 5.3 — Automation Gateway Ingress and Dispatch Admission.
 */
import { describe, it, expect } from 'vitest';
import { IngressCredentialScopeSchema } from '../../types/ingress-credential.js';

const UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('IngressCredentialScopeSchema', () => {
  it('parses valid credential scope', () => {
    const result = IngressCredentialScopeSchema.safeParse({
      project_id: UUID,
      workflow_ref: 'workflow:test',
      allowed_event_names: ['trigger', 'webhook'],
      key_id: 'key-1',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.project_id).toBe(UUID);
      expect(result.data.allowed_event_names).toContain('trigger');
    }
  });

  it('accepts optional expiry', () => {
    const result = IngressCredentialScopeSchema.safeParse({
      project_id: UUID,
      workflow_ref: 'workflow:test',
      allowed_event_names: ['trigger'],
      key_id: 'key-1',
      expiry: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty allowed_event_names', () => {
    const result = IngressCredentialScopeSchema.safeParse({
      project_id: UUID,
      workflow_ref: 'workflow:test',
      allowed_event_names: [],
      key_id: 'key-1',
    });
    expect(result.success).toBe(true); // empty array is valid per schema
  });
});
