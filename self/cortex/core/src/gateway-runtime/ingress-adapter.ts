import {
  IngressTriggerEnvelopeSchema,
  type IIngressGateway,
  type IngressDispatchOutcome,
  type IngressTriggerEnvelope,
} from '@nous/shared';
import type { IPrincipalSystemGatewayRuntime } from './types.js';

export class GatewayRuntimeIngressAdapter implements IIngressGateway {
  private readonly dedup = new Map<
    string,
    { runId: string; dispatchRef: string; evidenceRef: string }
  >();

  constructor(private readonly runtime: IPrincipalSystemGatewayRuntime) {}

  async submit(envelope: IngressTriggerEnvelope): Promise<IngressDispatchOutcome> {
    const parsed = IngressTriggerEnvelopeSchema.safeParse(envelope);
    if (!parsed.success) {
      return {
        outcome: 'rejected',
        reason: 'invalid_envelope',
        reason_code: 'gateway_runtime_ingress_invalid_envelope',
        evidence_ref: 'gateway-runtime:ingress:invalid',
        evidence_refs: ['gateway runtime ingress rejected invalid envelope'],
      };
    }

    const dedupKey = `${parsed.data.source_id}:${parsed.data.idempotency_key}`;
    const existing = this.dedup.get(dedupKey);
    if (existing) {
      return {
        outcome: 'accepted_already_dispatched',
        run_id: existing.runId as never,
        dispatch_ref: existing.dispatchRef,
        evidence_ref: existing.evidenceRef,
      };
    }

    const accepted = await this.runtime.submitIngressEnvelope(parsed.data);
    if (accepted.outcome === 'accepted_dispatched') {
      this.dedup.set(dedupKey, {
        runId: accepted.run_id,
        dispatchRef: accepted.dispatch_ref,
        evidenceRef: accepted.evidence_ref,
      });
    }

    return accepted;
  }
}
