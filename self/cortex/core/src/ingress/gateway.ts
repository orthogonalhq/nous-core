/**
 * Callable canonical ingress gateway implementation.
 *
 * Scheduler, hook, and future trigger adapters all submit through this single
 * validation/authn/authz/idempotency/admission path.
 */
import type {
  IIngressAuthnVerifier,
  IIngressAuthzEvaluator,
  IIngressDispatchAdmission,
  IIngressGateway,
  IIngressIdempotencyStore,
  IIngressTriggerValidator,
  IngressDispatchOutcome,
  IngressTriggerEnvelope,
} from '@nous/shared';

export interface IngressGatewayOptions {
  validator: IIngressTriggerValidator;
  authnVerifier: IIngressAuthnVerifier;
  authzEvaluator: IIngressAuthzEvaluator;
  idempotencyStore: IIngressIdempotencyStore;
  dispatchAdmission: IIngressDispatchAdmission;
}

export class IngressGateway implements IIngressGateway {
  constructor(private readonly options: IngressGatewayOptions) {}

  async submit(envelope: IngressTriggerEnvelope): Promise<IngressDispatchOutcome> {
    const validation = await this.options.validator.validate(envelope);
    if (!validation.valid) {
      return {
        outcome: 'rejected',
        reason: validation.reason,
        evidence_ref: `ingress:${envelope.trigger_id}`,
        evidence_refs: ['ingress validation failed'],
      };
    }

    const authn = await this.options.authnVerifier.verify(validation.envelope);
    if (!authn.authenticated) {
      return {
        outcome: 'rejected',
        reason: authn.reason,
        evidence_ref: `ingress:${validation.envelope.trigger_id}`,
        evidence_refs: [`authn failed for trigger ${validation.envelope.trigger_id}`],
      };
    }

    const authz = await this.options.authzEvaluator.evaluate(
      validation.envelope,
      authn.auth_context_ref,
    );
    if (!authz.allowed) {
      return {
        outcome: 'rejected',
        reason: authz.reason,
        evidence_ref: `ingress:${validation.envelope.trigger_id}`,
        evidence_refs: [`authz blocked: ${authz.reason}`],
      };
    }

    const claim = await this.options.idempotencyStore.claim(validation.envelope);
    return this.options.dispatchAdmission.admit(validation.envelope, claim);
  }
}
