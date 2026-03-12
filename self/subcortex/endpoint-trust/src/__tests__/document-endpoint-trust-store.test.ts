import { describe, expect, it } from 'vitest';
import { DocumentEndpointTrustStore } from '../document-endpoint-trust-store.js';
import { createMemoryDocumentStore } from './test-store.js';

const NOW = '2026-03-11T00:00:00.000Z';
const PROJECT_ID = '550e8400-e29b-41d4-a716-446655441001' as any;
const PERIPHERAL_ID = '550e8400-e29b-41d4-a716-446655441002';
const ENDPOINT_ID = '550e8400-e29b-41d4-a716-446655441003';

describe('DocumentEndpointTrustStore', () => {
  it('persists and lists peripheral, endpoint, grant, session, and incident records', async () => {
    const store = new DocumentEndpointTrustStore(createMemoryDocumentStore());

    await store.savePeripheral({
      peripheral_id: PERIPHERAL_ID,
      project_id: PROJECT_ID,
      display_name: 'Desk microphone',
      principal_id: 'principal',
      trust_state: 'trusted',
      metadata: {},
      evidence_refs: ['pairing:approved'],
      created_at: NOW,
      updated_at: NOW,
    });
    await store.saveEndpoint({
      endpoint_id: ENDPOINT_ID,
      peripheral_id: PERIPHERAL_ID,
      project_id: PROJECT_ID,
      display_name: 'Capture',
      direction: 'sensory',
      capability_keys: ['audio.capture'],
      trust_state: 'trusted',
      metadata: {},
      evidence_refs: ['endpoint:registered'],
      created_at: NOW,
      updated_at: NOW,
    });
    await store.saveGrant({
      grant_id: '550e8400-e29b-41d4-a716-446655441004',
      endpoint_id: ENDPOINT_ID,
      peripheral_id: PERIPHERAL_ID,
      project_id: PROJECT_ID,
      capability_key: 'audio.capture',
      capability_class: 'sensory',
      policy_ref: 'policy:audio',
      granted_by: 'principal',
      status: 'active',
      evidence_refs: ['grant:1'],
      granted_at: NOW,
    });
    await store.saveSession({
      session_id: '550e8400-e29b-41d4-a716-446655441005',
      endpoint_id: ENDPOINT_ID,
      peripheral_id: PERIPHERAL_ID,
      project_id: PROJECT_ID,
      status: 'active',
      established_by: 'principal',
      last_sequence: 0,
      evidence_refs: ['session:1'],
      established_at: NOW,
    });
    await store.saveIncident({
      incident_id: '550e8400-e29b-41d4-a716-446655441006',
      peripheral_id: PERIPHERAL_ID,
      project_id: PROJECT_ID,
      incident_type: 'manual_suspend',
      reported_by: 'principal',
      severity: 'high',
      reason_code: 'NDT-901-SUSPEND',
      action_taken: ['suspend_peripheral', 'suspend_endpoints', 'revoke_sessions', 'escalate'],
      evidence_refs: ['incident:1'],
      reported_at: NOW,
    });

    expect((await store.getPeripheral(PERIPHERAL_ID))?.display_name).toBe('Desk microphone');
    expect((await store.listEndpointsByPeripheral(PERIPHERAL_ID))).toHaveLength(1);
    expect((await store.listGrantsByEndpoint(ENDPOINT_ID))).toHaveLength(1);
    expect((await store.listSessionsByPeripheral(PERIPHERAL_ID))).toHaveLength(1);
    expect((await store.listIncidentsByPeripheral(PERIPHERAL_ID))).toHaveLength(1);
    expect((await store.listPeripheralsByProject(PROJECT_ID))).toHaveLength(1);
    expect((await store.listEndpointsByProject(PROJECT_ID))).toHaveLength(1);
    expect((await store.listSessionsByProject(PROJECT_ID))).toHaveLength(1);
    expect((await store.listIncidentsByProject(PROJECT_ID))).toHaveLength(1);
  });
});
