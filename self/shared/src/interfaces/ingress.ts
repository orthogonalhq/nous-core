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
  WorkflowExecutionId,
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

/** Result of idempotency reservation / replay check. */
export type IngressIdempotencyClaimResult =
  | {
      status: 'claimed';
      reservation_id: string;
      run_id: WorkflowExecutionId;
      recorded_at: string;
    }
  | {
      status: 'duplicate';
      run_id: WorkflowExecutionId;
      dispatch_ref: string;
      evidence_ref: string;
    }
  | { status: 'replay' };

// Backward-compatible alias retained while Phase 9.3 propagates through runtime code.
export type IngressIdempotencyCheckResult = IngressIdempotencyClaimResult;

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
  claim(
    envelope: IngressTriggerEnvelope,
  ): Promise<IngressIdempotencyClaimResult>;
  commitDispatch(
    reservationId: string,
    dispatchRef: string,
    evidenceRef: string,
  ): Promise<void>;
  releaseClaim(
    reservationId: string,
    reasonCode: string,
  ): Promise<void>;
}

/** Admits validated trigger into run creation path. Produces dispatch outcome. */
export interface IIngressDispatchAdmission {
  admit(
    envelope: IngressTriggerEnvelope,
    idempotencyResult: IngressIdempotencyClaimResult,
  ): Promise<IngressDispatchOutcome>;
}

/** Callable canonical ingress path for scheduler and future adapters. */
export interface IIngressGateway {
  submit(envelope: IngressTriggerEnvelope): Promise<IngressDispatchOutcome>;
}
