/**
 * Ingress evidence event type contract tests.
 *
 * Phase 5.3 — Automation Gateway Ingress and Dispatch Admission.
 */
import { describe, it, expect } from 'vitest';
import { IngressEvidenceEventTypeSchema } from '../../types/ingress-events.js';

describe('IngressEvidenceEventTypeSchema', () => {
  it('accepts all evidence event types', () => {
    expect(
      IngressEvidenceEventTypeSchema.safeParse('ingress_received').success,
    ).toBe(true);
    expect(
      IngressEvidenceEventTypeSchema.safeParse('ingress_authenticated').success,
    ).toBe(true);
    expect(
      IngressEvidenceEventTypeSchema.safeParse('ingress_authorized').success,
    ).toBe(true);
    expect(
      IngressEvidenceEventTypeSchema.safeParse(
        'ingress_idempotency_evaluated',
      ).success,
    ).toBe(true);
    expect(
      IngressEvidenceEventTypeSchema.safeParse('ingress_dispatched').success,
    ).toBe(true);
    expect(
      IngressEvidenceEventTypeSchema.safeParse('ingress_rejected').success,
    ).toBe(true);
  });

  it('rejects invalid event type', () => {
    expect(IngressEvidenceEventTypeSchema.safeParse('invalid').success).toBe(
      false,
    );
  });
});
