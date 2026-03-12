import type {
  EndpointTransportValidationRequest,
  EndpointTransportValidationResult,
} from '@nous/shared';
import { EndpointTransportValidationResultSchema } from '@nous/shared';

export interface TransportValidatorOptions {
  now?: () => string;
}

export class TransportValidator {
  private readonly now: () => string;

  constructor(options: TransportValidatorOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  validate(
    input: EndpointTransportValidationRequest,
  ): EndpointTransportValidationResult {
    const observedAt = input.observed_at ?? this.now();

    if (input.peripheral.trust_state !== 'trusted') {
      return this.block('NDT-301-PERIPHERAL_NOT_TRUSTED', observedAt, input);
    }
    if (input.endpoint.trust_state !== 'trusted') {
      return this.block('NDT-302-ENDPOINT_NOT_TRUSTED', observedAt, input);
    }
    if (!input.session) {
      return this.block('NDT-303-SESSION_MISSING', observedAt, input);
    }
    if (input.session.status !== 'active') {
      return this.block('NDT-304-SESSION_NOT_ACTIVE', observedAt, input);
    }
    if (
      input.envelope.session_id !== input.session.session_id ||
      input.envelope.endpoint_id !== input.session.endpoint_id ||
      input.envelope.peripheral_id !== input.session.peripheral_id
    ) {
      return this.block('NDT-305-SESSION_MISMATCH', observedAt, input);
    }
    if (input.envelope.expires_at <= observedAt) {
      return this.block('NDT-306-ENVELOPE_EXPIRED', observedAt, input);
    }
    if (input.session.expires_at && input.session.expires_at <= observedAt) {
      return this.block('NDT-307-SESSION_EXPIRED', observedAt, input);
    }
    if (input.envelope.sequence <= input.session.last_sequence) {
      return this.block('NDT-308-SEQUENCE_REGRESSION', observedAt, input);
    }
    if (input.session.last_nonce && input.session.last_nonce === input.envelope.nonce) {
      return this.block('NDT-309-NONCE_REPLAY', observedAt, input);
    }

    return EndpointTransportValidationResultSchema.parse({
      decision: 'accepted',
      session_id: input.session.session_id,
      evidence_refs: [`transport:${input.envelope.envelope_id}`],
      evaluated_at: observedAt,
    });
  }

  private block(
    reasonCode: string,
    evaluatedAt: string,
    input: EndpointTransportValidationRequest,
  ): EndpointTransportValidationResult {
    return EndpointTransportValidationResultSchema.parse({
      decision: 'blocked',
      reason_code: reasonCode,
      session_id: input.session?.session_id,
      evidence_refs: [`transport:${input.envelope.envelope_id}`, `reason:${reasonCode}`],
      evaluated_at: evaluatedAt,
    });
  }
}
