import { describe, expect, it } from 'vitest';
import {
  EndpointAuthorizationRequestSchema,
  EndpointAuthorizationResultSchema,
  EndpointCapabilityGrantRecordSchema,
  EndpointIncidentRecordSchema,
  EndpointTrustSurfaceSummarySchema,
  EndpointPairingRecordSchema,
  EndpointSessionRecordSchema,
  EndpointTransportEnvelopeSchema,
  EndpointTrustEndpointSchema,
  EndpointTrustPeripheralSchema,
} from '../../types/endpoint-trust.js';

const NOW = '2026-03-11T00:00:00.000Z';
const LATER = '2026-03-11T01:00:00.000Z';
const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440901';
const PERIPHERAL_ID = '550e8400-e29b-41d4-a716-446655440902';
const ENDPOINT_ID = '550e8400-e29b-41d4-a716-446655440903';
const GRANT_ID = '550e8400-e29b-41d4-a716-446655440904';
const SESSION_ID = '550e8400-e29b-41d4-a716-446655440905';

describe('EndpointTrustPeripheralSchema', () => {
  it('parses a trusted paired peripheral record', () => {
    const result = EndpointTrustPeripheralSchema.safeParse({
      peripheral_id: PERIPHERAL_ID,
      project_id: PROJECT_ID,
      display_name: 'Desk microphone',
      principal_id: 'principal',
      trust_state: 'trusted',
      paired_at: NOW,
      last_seen_at: NOW,
      metadata: { room: 'studio' },
      evidence_refs: ['pairing:approved'],
      created_at: NOW,
      updated_at: NOW,
    });

    expect(result.success).toBe(true);
  });
});

describe('EndpointPairingRecordSchema', () => {
  it('parses pairing approvals with evidence linkage', () => {
    const result = EndpointPairingRecordSchema.safeParse({
      pairing_id: '550e8400-e29b-41d4-a716-446655440906',
      peripheral_id: PERIPHERAL_ID,
      project_id: PROJECT_ID,
      principal_id: 'principal',
      status: 'approved',
      approval_evidence_ref: 'approval:pairing',
      evidence_refs: ['pairing:request', 'approval:pairing'],
      requested_at: NOW,
      reviewed_at: NOW,
      metadata: {},
    });

    expect(result.success).toBe(true);
  });
});

describe('EndpointTrustEndpointSchema', () => {
  it('requires immutable endpoint direction and explicit capability keys', () => {
    const result = EndpointTrustEndpointSchema.safeParse({
      endpoint_id: ENDPOINT_ID,
      peripheral_id: PERIPHERAL_ID,
      project_id: PROJECT_ID,
      display_name: 'Microphone capture',
      direction: 'sensory',
      capability_keys: ['audio.capture'],
      trust_state: 'trusted',
      evidence_refs: ['endpoint:registered'],
      metadata: {},
      created_at: NOW,
      updated_at: NOW,
    });

    expect(result.success).toBe(true);
  });
});

describe('EndpointCapabilityGrantRecordSchema', () => {
  it('parses active grants with policy linkage', () => {
    const result = EndpointCapabilityGrantRecordSchema.safeParse({
      grant_id: GRANT_ID,
      endpoint_id: ENDPOINT_ID,
      peripheral_id: PERIPHERAL_ID,
      project_id: PROJECT_ID,
      capability_key: 'audio.capture',
      capability_class: 'sensory',
      policy_ref: 'policy:audio-capture',
      granted_by: 'principal',
      status: 'active',
      evidence_refs: ['grant:1'],
      granted_at: NOW,
    });

    expect(result.success).toBe(true);
  });
});

describe('EndpointSessionRecordSchema', () => {
  it('parses active sessions with monotonic sequence state', () => {
    const result = EndpointSessionRecordSchema.safeParse({
      session_id: SESSION_ID,
      endpoint_id: ENDPOINT_ID,
      peripheral_id: PERIPHERAL_ID,
      project_id: PROJECT_ID,
      status: 'active',
      established_by: 'principal',
      last_nonce: '550e8400-e29b-41d4-a716-446655440907',
      last_sequence: 4,
      evidence_refs: ['session:start'],
      established_at: NOW,
      expires_at: LATER,
    });

    expect(result.success).toBe(true);
  });
});

describe('EndpointTransportEnvelopeSchema', () => {
  it('parses signed transport envelopes with TTL and sequence', () => {
    const result = EndpointTransportEnvelopeSchema.safeParse({
      envelope_id: '550e8400-e29b-41d4-a716-446655440908',
      endpoint_id: ENDPOINT_ID,
      peripheral_id: PERIPHERAL_ID,
      project_id: PROJECT_ID,
      session_id: SESSION_ID,
      nonce: '550e8400-e29b-41d4-a716-446655440909',
      sequence: 5,
      issued_at: NOW,
      expires_at: LATER,
      payload_hash: 'a'.repeat(64),
      signature: 'signed-payload',
      metadata: {},
    });

    expect(result.success).toBe(true);
  });
});

describe('EndpointAuthorizationRequestSchema', () => {
  it('parses high-risk action authorization requests with confirmation proof', () => {
    const result = EndpointAuthorizationRequestSchema.safeParse({
      request_id: '550e8400-e29b-41d4-a716-446655440910',
      endpoint_id: ENDPOINT_ID,
      peripheral_id: PERIPHERAL_ID,
      project_id: PROJECT_ID,
      capability_key: 'door.unlock',
      capability_class: 'action',
      risk: 'high',
      policy_ref: 'policy:door-unlock',
      session_id: SESSION_ID,
      confirmation_proof: {
        proof_id: '550e8400-e29b-41d4-a716-446655440911',
        issued_at: NOW,
        expires_at: LATER,
        scope_hash: 'b'.repeat(64),
        action: 'edit',
        tier: 'T2',
        signature: 'proof-signature',
      },
      control_command_envelope: {
        control_command_id: '550e8400-e29b-41d4-a716-446655440912',
        actor_type: 'principal',
        actor_id: '550e8400-e29b-41d4-a716-446655440913',
        actor_session_id: '550e8400-e29b-41d4-a716-446655440914',
        actor_seq: 1,
        nonce: '550e8400-e29b-41d4-a716-446655440915',
        issued_at: NOW,
        expires_at: LATER,
        scope: {
          class: 'project_run_scope',
          kind: 'project_run',
          target_ids: [],
          project_id: PROJECT_ID,
        },
        payload_hash: 'c'.repeat(64),
        command_signature: 'command-signature',
        action: 'edit',
        payload: { target: 'door.unlock' },
      },
      evidence_refs: ['request:1'],
      requested_at: NOW,
    });

    expect(result.success).toBe(true);
  });
});

describe('EndpointAuthorizationResultSchema', () => {
  it('parses blocked authorization outcomes with reason codes', () => {
    const result = EndpointAuthorizationResultSchema.safeParse({
      decision: 'blocked',
      reason_code: 'NDT-401-CAPABILITY_NOT_GRANTED',
      request_id: '550e8400-e29b-41d4-a716-446655440916',
      endpoint_id: ENDPOINT_ID,
      peripheral_id: PERIPHERAL_ID,
      project_id: PROJECT_ID,
      session_id: SESSION_ID,
      evidence_refs: ['authz:block'],
      evaluated_at: NOW,
    });

    expect(result.success).toBe(true);
  });
});

describe('EndpointIncidentRecordSchema', () => {
  it('parses incident records with deterministic response actions', () => {
    const result = EndpointIncidentRecordSchema.safeParse({
      incident_id: '550e8400-e29b-41d4-a716-446655440917',
      peripheral_id: PERIPHERAL_ID,
      endpoint_id: ENDPOINT_ID,
      project_id: PROJECT_ID,
      incident_type: 'mitm_detected',
      reported_by: 'runtime',
      severity: 'critical',
      reason_code: 'NDT-901-MITM_DETECTED',
      action_taken: ['revoke_peripheral', 'revoke_endpoints', 'revoke_sessions', 'escalate'],
      evidence_refs: ['incident:mitm'],
      reported_at: NOW,
    });

    expect(result.success).toBe(true);
  });
});

describe('EndpointTrustSurfaceSummarySchema', () => {
  it('parses project-scoped trust summaries for projection surfaces', () => {
    const result = EndpointTrustSurfaceSummarySchema.safeParse({
      projectId: PROJECT_ID,
      peripheralCount: 2,
      trustedPeripheralCount: 1,
      suspendedPeripheralCount: 1,
      revokedPeripheralCount: 0,
      sensoryEndpointCount: 1,
      actionEndpointCount: 1,
      activeSessionCount: 1,
      expiringSessionCount: 1,
      latestIncidentSeverity: 'critical',
      latestIncidentReasonCode: 'NDT-901-MITM_DETECTED',
      registryBlockedEndpointCount: 1,
      diagnostics: {
        degradedReasonCode: 'endpoint_summary_partial',
      },
    });

    expect(result.success).toBe(true);
  });
});
