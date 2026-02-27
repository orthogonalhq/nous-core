/**
 * Ingress authentication verifier implementation.
 *
 * Phase 5.3 — Automation Gateway Ingress and Dispatch Admission.
 * For webhooks: HMAC verification (constant-time). For scheduler/hook: internal principal.
 */
import type {
  IngressTriggerEnvelope,
  IngressAuthnResult,
} from '@nous/shared';
import type { IIngressAuthnVerifier } from '@nous/shared';

export class IngressAuthnVerifier implements IIngressAuthnVerifier {
  async verify(envelope: IngressTriggerEnvelope): Promise<IngressAuthnResult> {
    // Scheduler and hook: internal principal — always authenticated
    if (envelope.trigger_type === 'scheduler' || envelope.trigger_type === 'hook') {
      return {
        authenticated: true,
        auth_context_ref: `internal:${envelope.source_id}:${envelope.trigger_id}`,
      };
    }

    // system_event: internal
    if (envelope.trigger_type === 'system_event') {
      return {
        authenticated: true,
        auth_context_ref: `system:${envelope.source_id}:${envelope.trigger_id}`,
      };
    }

    // Webhook: requires auth_context_ref from HMAC verification (adapter responsibility)
    // V1: if auth_context_ref is present, treat as authenticated (adapter verified HMAC)
    if (envelope.trigger_type === 'webhook') {
      if (envelope.auth_context_ref) {
        return {
          authenticated: true,
          auth_context_ref: envelope.auth_context_ref,
        };
      }
      return { authenticated: false, reason: 'unauthenticated' };
    }

    return { authenticated: false, reason: 'unauthenticated' };
  }
}
