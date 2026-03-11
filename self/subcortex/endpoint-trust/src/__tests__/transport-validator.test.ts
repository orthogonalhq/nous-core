import { describe, expect, it } from 'vitest';
import { TransportValidator } from '../transport-validator.js';

const NOW = '2026-03-11T00:00:00.000Z';
const LATER = '2026-03-11T01:00:00.000Z';
const PROJECT_ID = '550e8400-e29b-41d4-a716-446655441021' as any;
const PERIPHERAL_ID = '550e8400-e29b-41d4-a716-446655441022';
const ENDPOINT_ID = '550e8400-e29b-41d4-a716-446655441023';
const SESSION_ID = '550e8400-e29b-41d4-a716-446655441024';

describe('TransportValidator', () => {
  it('accepts valid envelopes with advancing sequence', () => {
    const validator = new TransportValidator({ now: () => NOW });
    const result = validator.validate({
      peripheral: {
        peripheral_id: PERIPHERAL_ID,
        project_id: PROJECT_ID,
        display_name: 'Mic',
        principal_id: 'principal',
        trust_state: 'trusted',
        metadata: {},
        evidence_refs: [],
        created_at: NOW,
        updated_at: NOW,
      },
      endpoint: {
        endpoint_id: ENDPOINT_ID,
        peripheral_id: PERIPHERAL_ID,
        project_id: PROJECT_ID,
        display_name: 'Capture',
        direction: 'sensory',
        capability_keys: ['audio.capture'],
        trust_state: 'trusted',
        metadata: {},
        evidence_refs: [],
        created_at: NOW,
        updated_at: NOW,
      },
      session: {
        session_id: SESSION_ID,
        endpoint_id: ENDPOINT_ID,
        peripheral_id: PERIPHERAL_ID,
        project_id: PROJECT_ID,
        status: 'active',
        established_by: 'principal',
        last_nonce: '550e8400-e29b-41d4-a716-446655441025',
        last_sequence: 4,
        evidence_refs: [],
        established_at: NOW,
        expires_at: LATER,
      },
      envelope: {
        envelope_id: '550e8400-e29b-41d4-a716-446655441026',
        endpoint_id: ENDPOINT_ID,
        peripheral_id: PERIPHERAL_ID,
        project_id: PROJECT_ID,
        session_id: SESSION_ID,
        nonce: '550e8400-e29b-41d4-a716-446655441027',
        sequence: 5,
        issued_at: NOW,
        expires_at: LATER,
        payload_hash: 'a'.repeat(64),
        signature: 'sig',
        metadata: {},
      },
    });

    expect(result.decision).toBe('accepted');
  });

  it('blocks replayed or out-of-order envelopes', () => {
    const validator = new TransportValidator({ now: () => NOW });
    const result = validator.validate({
      peripheral: {
        peripheral_id: PERIPHERAL_ID,
        project_id: PROJECT_ID,
        display_name: 'Mic',
        principal_id: 'principal',
        trust_state: 'trusted',
        metadata: {},
        evidence_refs: [],
        created_at: NOW,
        updated_at: NOW,
      },
      endpoint: {
        endpoint_id: ENDPOINT_ID,
        peripheral_id: PERIPHERAL_ID,
        project_id: PROJECT_ID,
        display_name: 'Capture',
        direction: 'sensory',
        capability_keys: ['audio.capture'],
        trust_state: 'trusted',
        metadata: {},
        evidence_refs: [],
        created_at: NOW,
        updated_at: NOW,
      },
      session: {
        session_id: SESSION_ID,
        endpoint_id: ENDPOINT_ID,
        peripheral_id: PERIPHERAL_ID,
        project_id: PROJECT_ID,
        status: 'active',
        established_by: 'principal',
        last_nonce: '550e8400-e29b-41d4-a716-446655441028',
        last_sequence: 5,
        evidence_refs: [],
        established_at: NOW,
        expires_at: LATER,
      },
      envelope: {
        envelope_id: '550e8400-e29b-41d4-a716-446655441029',
        endpoint_id: ENDPOINT_ID,
        peripheral_id: PERIPHERAL_ID,
        project_id: PROJECT_ID,
        session_id: SESSION_ID,
        nonce: '550e8400-e29b-41d4-a716-446655441028',
        sequence: 5,
        issued_at: NOW,
        expires_at: LATER,
        payload_hash: 'a'.repeat(64),
        signature: 'sig',
        metadata: {},
      },
    });

    expect(result.decision).toBe('blocked');
    expect(result.reason_code).toBe('NDT-308-SEQUENCE_REGRESSION');
  });
});
