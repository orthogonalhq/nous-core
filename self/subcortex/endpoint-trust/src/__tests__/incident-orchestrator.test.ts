import { describe, expect, it } from 'vitest';
import { DocumentEndpointTrustStore } from '../document-endpoint-trust-store.js';
import { EndpointStore } from '../endpoint-store.js';
import { IncidentOrchestrator } from '../incident-orchestrator.js';
import { SessionStore } from '../session-store.js';
import { createMemoryDocumentStore } from './test-store.js';

const NOW = '2026-03-11T00:00:00.000Z';
const PROJECT_ID = '550e8400-e29b-41d4-a716-446655441031' as any;
const PERIPHERAL_ID = '550e8400-e29b-41d4-a716-446655441032';
const ENDPOINT_ID = '550e8400-e29b-41d4-a716-446655441033';

describe('IncidentOrchestrator', () => {
  it('revokes peripheral endpoints and sessions for MITM incidents', async () => {
    const store = new DocumentEndpointTrustStore(createMemoryDocumentStore());
    const endpointStore = new EndpointStore(store, { now: () => NOW });
    const sessionStore = new SessionStore(store, { now: () => NOW });
    const orchestrator = new IncidentOrchestrator(store, {
      endpointStore,
      sessionStore,
      now: () => NOW,
    });

    await store.savePeripheral({
      peripheral_id: PERIPHERAL_ID,
      project_id: PROJECT_ID,
      display_name: 'Mic',
      principal_id: 'principal',
      trust_state: 'trusted',
      metadata: {},
      evidence_refs: [],
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
      evidence_refs: [],
      created_at: NOW,
      updated_at: NOW,
    });
    await store.saveSession({
      session_id: '550e8400-e29b-41d4-a716-446655441034',
      endpoint_id: ENDPOINT_ID,
      peripheral_id: PERIPHERAL_ID,
      project_id: PROJECT_ID,
      status: 'active',
      established_by: 'principal',
      last_sequence: 0,
      evidence_refs: [],
      established_at: NOW,
    });

    const incident = await orchestrator.handle(
      {
        peripheral_id: PERIPHERAL_ID,
        endpoint_id: ENDPOINT_ID,
        project_id: PROJECT_ID,
        incident_type: 'mitm_detected',
        reported_by: 'runtime',
        severity: 'critical',
        reason_code: 'NDT-901-MITM_DETECTED',
        metadata: {},
        evidence_refs: ['incident:mitm'],
      },
      (await store.getPeripheral(PERIPHERAL_ID))!,
    );

    expect(incident.action_taken).toContain('revoke_sessions');
    expect((await store.getPeripheral(PERIPHERAL_ID))?.trust_state).toBe('revoked');
    expect((await store.getEndpoint(ENDPOINT_ID))?.trust_state).toBe('revoked');
    expect((await store.listSessionsByPeripheral(PERIPHERAL_ID))[0]?.status).toBe('revoked');
  });
});
