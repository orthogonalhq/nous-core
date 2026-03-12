import { describe, expect, it } from 'vitest';
import { AuthorizationEngine } from '../authorization-engine.js';

const NOW = '2026-03-11T00:00:00.000Z';
const PROJECT_ID = '550e8400-e29b-41d4-a716-446655441011' as any;
const REQUEST_ID = '550e8400-e29b-41d4-a716-446655441012';
const PERIPHERAL_ID = '550e8400-e29b-41d4-a716-446655441013';
const ENDPOINT_ID = '550e8400-e29b-41d4-a716-446655441014';

describe('AuthorizationEngine', () => {
  it('allows trusted sensory requests when grant and policy match', () => {
    const engine = new AuthorizationEngine();
    const result = engine.authorize({
      request: {
        request_id: REQUEST_ID,
        endpoint_id: ENDPOINT_ID,
        peripheral_id: PERIPHERAL_ID,
        project_id: PROJECT_ID,
        capability_key: 'audio.capture',
        capability_class: 'sensory',
        risk: 'standard',
        policy_ref: 'policy:audio',
        evidence_refs: [],
        requested_at: NOW,
      },
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
      grant: {
        grant_id: '550e8400-e29b-41d4-a716-446655441015',
        endpoint_id: ENDPOINT_ID,
        peripheral_id: PERIPHERAL_ID,
        project_id: PROJECT_ID,
        capability_key: 'audio.capture',
        capability_class: 'sensory',
        policy_ref: 'policy:audio',
        granted_by: 'principal',
        status: 'active',
        evidence_refs: [],
        granted_at: NOW,
      },
      session: null,
      confirmationValidated: true,
      now: NOW,
    });

    expect(result.decision).toBe('allowed');
  });

  it('blocks high-risk action requests without validated confirmation', () => {
    const engine = new AuthorizationEngine();
    const result = engine.authorize({
      request: {
        request_id: REQUEST_ID,
        endpoint_id: ENDPOINT_ID,
        peripheral_id: PERIPHERAL_ID,
        project_id: PROJECT_ID,
        capability_key: 'door.unlock',
        capability_class: 'action',
        risk: 'high',
        policy_ref: 'policy:door',
        evidence_refs: [],
        requested_at: NOW,
      },
      peripheral: {
        peripheral_id: PERIPHERAL_ID,
        project_id: PROJECT_ID,
        display_name: 'Door controller',
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
        display_name: 'Unlock command',
        direction: 'action',
        capability_keys: ['door.unlock'],
        trust_state: 'trusted',
        metadata: {},
        evidence_refs: [],
        created_at: NOW,
        updated_at: NOW,
      },
      grant: {
        grant_id: '550e8400-e29b-41d4-a716-446655441016',
        endpoint_id: ENDPOINT_ID,
        peripheral_id: PERIPHERAL_ID,
        project_id: PROJECT_ID,
        capability_key: 'door.unlock',
        capability_class: 'action',
        policy_ref: 'policy:door',
        granted_by: 'principal',
        status: 'active',
        evidence_refs: [],
        granted_at: NOW,
      },
      session: null,
      confirmationValidated: false,
      now: NOW,
    });

    expect(result.decision).toBe('blocked');
    expect(result.reason_code).toBe('NDT-408-CONFIRMATION_REQUIRED');
  });
});
