/**
 * Ingress admission interfaces for Nous-OSS.
 *
 * Phase 5.3 — Automation Gateway Ingress and Dispatch Admission.
 * Canonical source: automation-gateway-ingress-architecture-v1.md
 */
import type {
  IngressTriggerEnvelope,
  IngressDispatchOutcome,
  IngressRejectReason,
} from '../types/index.js';

/** Result of trigger validation: either validated envelope or reject reason. */
export type IngressValidationResult =
  | { valid: true; envelope: IngressTriggerEnvelope }
  | { valid: false; reason: IngressRejectReason };

/** Result of authn verification: either auth context ref or reject. */
export type IngressAuthnResult =
  | { authenticated: true; auth_context_ref: string }
  | { authenticated: false; reason: 'unauthenticated' };

/** Result of authz evaluation: either allow or deny with reason. */
export type IngressAuthzResult =
  | { allowed: true }
  | {
      allowed: false;
      reason: 'scope_mismatch' | 'event_forbidden' | 'policy_blocked';
    };

/** Result of idempotency/replay check. */
export type IngressIdempotencyCheckResult =
  | { status: 'new' }
  | {
      status: 'duplicate';
      run_id: string;
      dispatch_ref: string;
      evidence_ref: string;
    }
  | { status: 'replay' };

/** Validates raw trigger payload against IngressTriggerEnvelope schema. */
export interface IIngressTriggerValidator {
  validate(
    payload: unknown,
  ): IngressValidationResult | Promise<IngressValidationResult>;
}

/** Verifies authentication per trigger type. For webhooks: HMAC. */
export interface IIngressAuthnVerifier {
  verify(
    envelope: IngressTriggerEnvelope,
  ): IngressAuthnResult | Promise<IngressAuthnResult>;
}

/** Evaluates authorization: principal bound to workflow, event allowed. */
export interface IIngressAuthzEvaluator {
  evaluate(
    envelope: IngressTriggerEnvelope,
    auth_context_ref: string,
  ): IngressAuthzResult | Promise<IngressAuthzResult>;
}

/** Stores and retrieves dedup records. Dedup identity: source_id + idempotency_key. */
export interface IIngressIdempotencyStore {
  recordAndCheck(
    envelope: IngressTriggerEnvelope,
  ): Promise<IngressIdempotencyCheckResult>;
  recordDispatch(
    envelope: IngressTriggerEnvelope,
    run_id: string,
    dispatch_ref: string,
    evidence_ref: string,
  ): Promise<void>;
}

/** Admits validated trigger into run creation path. Produces dispatch outcome. */
export interface IIngressDispatchAdmission {
  admit(
    envelope: IngressTriggerEnvelope,
    idempotencyResult: IngressIdempotencyCheckResult,
  ): Promise<IngressDispatchOutcome>;
}
