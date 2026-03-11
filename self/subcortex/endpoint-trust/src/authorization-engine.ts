import { randomUUID } from 'node:crypto';
import type {
  EndpointAuthorizationRequest,
  EndpointAuthorizationResult,
  EndpointCapabilityGrantRecord,
  EndpointSessionRecord,
  EndpointTransportValidationResult,
  EndpointTrustEndpoint,
  EndpointTrustPeripheral,
} from '@nous/shared';
import { EndpointAuthorizationResultSchema } from '@nous/shared';

export interface AuthorizationDecisionInput {
  request: EndpointAuthorizationRequest;
  peripheral: EndpointTrustPeripheral | null;
  endpoint: EndpointTrustEndpoint | null;
  grant: EndpointCapabilityGrantRecord | null;
  session: EndpointSessionRecord | null;
  transportResult?: EndpointTransportValidationResult;
  confirmationValidated: boolean;
  now?: string;
}

export class AuthorizationEngine {
  authorize(input: AuthorizationDecisionInput): EndpointAuthorizationResult {
    const evaluatedAt = input.now ?? new Date().toISOString();
    const blocked = (reasonCode: string): EndpointAuthorizationResult =>
      EndpointAuthorizationResultSchema.parse({
        decision: 'blocked',
        reason_code: reasonCode,
        request_id: input.request.request_id ?? randomUUID(),
        endpoint_id: input.request.endpoint_id,
        peripheral_id: input.request.peripheral_id,
        project_id: input.request.project_id,
        session_id: input.request.session_id,
        evidence_refs: [...input.request.evidence_refs, `reason:${reasonCode}`],
        evaluated_at: evaluatedAt,
      });

    if (!input.peripheral || input.peripheral.trust_state !== 'trusted') {
      return blocked('NDT-401-PERIPHERAL_NOT_TRUSTED');
    }
    if (!input.endpoint || input.endpoint.trust_state !== 'trusted') {
      return blocked('NDT-402-ENDPOINT_NOT_TRUSTED');
    }
    if (input.endpoint.direction !== input.request.capability_class) {
      return blocked('NDT-403-DIRECTION_CAPABILITY_MISMATCH');
    }
    if (
      input.endpoint.registry_eligibility &&
      (
        input.endpoint.registry_eligibility.distribution_status !== 'active' ||
        input.endpoint.registry_eligibility.block_reason_codes.length > 0 ||
        input.endpoint.registry_eligibility.requires_principal_override
      )
    ) {
      return blocked('NDT-404-REGISTRY_GATE_BLOCKED');
    }
    if (
      !input.grant ||
      input.grant.status !== 'active' ||
      input.grant.capability_key !== input.request.capability_key ||
      input.grant.policy_ref !== input.request.policy_ref
    ) {
      return blocked('NDT-405-CAPABILITY_NOT_GRANTED');
    }
    if (input.request.session_id && (!input.session || input.session.status !== 'active')) {
      return blocked('NDT-406-SESSION_REQUIRED');
    }
    if (input.transportResult?.decision === 'blocked') {
      return blocked(input.transportResult.reason_code ?? 'NDT-407-TRANSPORT_BLOCKED');
    }
    if (input.request.risk === 'high' && !input.confirmationValidated) {
      return blocked('NDT-408-CONFIRMATION_REQUIRED');
    }

    return EndpointAuthorizationResultSchema.parse({
      decision: 'allowed',
      request_id: input.request.request_id ?? randomUUID(),
      endpoint_id: input.request.endpoint_id,
      peripheral_id: input.request.peripheral_id,
      project_id: input.request.project_id,
      grant_id: input.grant.grant_id,
      session_id: input.session?.session_id,
      evidence_refs: [...new Set([...input.request.evidence_refs, ...input.grant.evidence_refs])],
      evaluated_at: evaluatedAt,
    });
  }
}
