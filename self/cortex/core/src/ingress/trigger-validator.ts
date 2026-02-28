/**
 * Ingress trigger validator implementation.
 *
 * Phase 5.3 — Automation Gateway Ingress and Dispatch Admission.
 * Validates payload against IngressTriggerEnvelope schema.
 */
import { IngressTriggerEnvelopeSchema } from '@nous/shared';
import type { IIngressTriggerValidator, IngressValidationResult } from '@nous/shared';

export class IngressTriggerValidator implements IIngressTriggerValidator {
  validate(payload: unknown): IngressValidationResult {
    const parsed = IngressTriggerEnvelopeSchema.safeParse(payload);
    if (parsed.success) {
      return { valid: true, envelope: parsed.data };
    }

    // Determine reject reason from parse errors
    const issues = parsed.error.issues;
    for (const issue of issues) {
      const path = issue.path.join('.');
      if (path === 'project_id' || path === 'workflow_ref') {
        return { valid: false, reason: 'invalid_envelope' };
      }
      if (path === 'trigger_type') {
        return { valid: false, reason: 'invalid_envelope' };
      }
    }
    return { valid: false, reason: 'invalid_envelope' };
  }
}
