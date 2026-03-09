/**
 * Ingress outcome schema contract tests.
 *
 * Phase 5.3 — Automation Gateway Ingress and Dispatch Admission.
 */
import { describe, it, expect } from 'vitest';
import {
  IngressRejectReasonSchema,
  IngressDispatchOutcomeSchema,
} from '../../types/ingress-outcome.js';

const UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('IngressRejectReasonSchema', () => {
  it('accepts all reject reasons', () => {
    expect(IngressRejectReasonSchema.safeParse('unauthenticated').success).toBe(true);
    expect(IngressRejectReasonSchema.safeParse('scope_mismatch').success).toBe(true);
    expect(IngressRejectReasonSchema.safeParse('event_forbidden').success).toBe(true);
    expect(IngressRejectReasonSchema.safeParse('policy_blocked').success).toBe(true);
    expect(IngressRejectReasonSchema.safeParse('replay_detected').success).toBe(true);
    expect(IngressRejectReasonSchema.safeParse('rate_limited').success).toBe(true);
    expect(IngressRejectReasonSchema.safeParse('invalid_envelope').success).toBe(true);
    expect(IngressRejectReasonSchema.safeParse('control_state_blocked').success).toBe(
      true,
    );
    expect(
      IngressRejectReasonSchema.safeParse('workflow_admission_blocked').success,
    ).toBe(true);
  });
});

describe('IngressDispatchOutcomeSchema', () => {
  it('parses accepted_dispatched', () => {
    const result = IngressDispatchOutcomeSchema.safeParse({
      outcome: 'accepted_dispatched',
      run_id: UUID,
      dispatch_ref: 'dispatch:1',
      workflow_ref: 'workflow:test',
      policy_ref: 'policy:test',
      evidence_ref: 'evidence:1',
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.outcome === 'accepted_dispatched') {
      expect(result.data.run_id).toBe(UUID);
    }
  });

  it('parses accepted_already_dispatched', () => {
    const result = IngressDispatchOutcomeSchema.safeParse({
      outcome: 'accepted_already_dispatched',
      run_id: UUID,
      dispatch_ref: 'dispatch:1',
      evidence_ref: 'evidence:1',
    });
    expect(result.success).toBe(true);
  });

  it('parses rejected with reason and evidence_refs', () => {
    const result = IngressDispatchOutcomeSchema.safeParse({
      outcome: 'rejected',
      reason: 'workflow_admission_blocked',
      reason_code: 'workflow_definition_unavailable',
      evidence_ref: 'evidence:1',
      evidence_refs: ['control_state=hard_stopped blocks dispatch'],
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.outcome === 'rejected') {
      expect(result.data.reason).toBe('workflow_admission_blocked');
      expect(result.data.reason_code).toBe('workflow_definition_unavailable');
      expect(result.data.evidence_refs).toHaveLength(1);
    }
  });

  it('rejects rejected without evidence_refs', () => {
    const result = IngressDispatchOutcomeSchema.safeParse({
      outcome: 'rejected',
      reason: 'unauthenticated',
      evidence_ref: 'evidence:1',
      evidence_refs: [],
    });
    expect(result.success).toBe(false);
  });
});
