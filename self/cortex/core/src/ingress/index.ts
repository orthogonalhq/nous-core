/**
 * Ingress admission module.
 *
 * Phase 5.3 — Automation Gateway Ingress and Dispatch Admission.
 */
export { IngressTriggerValidator } from './trigger-validator.js';
export { IngressAuthnVerifier } from './authn-verifier.js';
export {
  IngressAuthzEvaluator,
  type IngressAuthzEvaluatorOptions,
} from './authz-evaluator.js';
export {
  InMemoryIngressIdempotencyStore,
  type IngressIdempotencyStoreOptions,
} from './idempotency-store.js';
export {
  IngressDispatchAdmission,
  type IngressDispatchAdmissionOptions,
} from './dispatch-admission.js';
export {
  IngressGateway,
  type IngressGatewayOptions,
} from './gateway.js';
