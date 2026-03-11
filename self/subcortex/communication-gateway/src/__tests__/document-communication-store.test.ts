import { describe, expect, it } from 'vitest';
import { DocumentCommunicationStore } from '../document-communication-store.js';
import { createMemoryDocumentStore } from './test-store.js';

const NOW = '2026-03-11T00:00:00.000Z';

describe('DocumentCommunicationStore', () => {
  it('persists bindings, routes, approval intake, and delivery attempts', async () => {
    const store = new DocumentCommunicationStore(createMemoryDocumentStore());

    await store.saveBinding({
      binding_id: '550e8400-e29b-41d4-a716-446655440401',
      channel: 'telegram',
      account_id: 'account:primary',
      channel_identity: '@principal',
      principal_id: 'principal',
      state: 'active',
      approved_by: 'principal',
      approved_at: NOW,
      evidence_refs: ['binding:1'],
      created_at: NOW,
      updated_at: NOW,
    });
    await store.saveApprovalIntake({
      intake_id: '550e8400-e29b-41d4-a716-446655440402',
      channel: 'telegram',
      account_id: 'account:primary',
      conversation_id: 'chat:1',
      channel_identity: '@principal',
      latest_ingress_id: '550e8400-e29b-41d4-a716-446655440403',
      status: 'pending',
      evidence_refs: ['intake:1'],
      first_seen_at: NOW,
      last_seen_at: NOW,
    });
    await store.saveRouteDecision({
      route_id: '550e8400-e29b-41d4-a716-446655440404',
      route_kind: 'project_message',
      route_key: 'project:msg',
      policy_decision_id: '550e8400-e29b-41d4-a716-446655440405',
      precedence_rank: 3,
      rule_id: 'route:project-message',
      evidence_refs: ['route:1'],
      created_at: NOW,
    });
    await store.saveDeliveryAttempt({
      delivery_attempt_id: '550e8400-e29b-41d4-a716-446655440406',
      route_id: '550e8400-e29b-41d4-a716-446655440404',
      egress_id: '550e8400-e29b-41d4-a716-446655440407',
      outcome: 'delivered',
      retry_budget_remaining: 0,
      reason_codes: [],
      evidence_refs: ['delivery:1'],
      occurred_at: NOW,
    });

    const binding = await store.findBindingByIdentity({
      channel: 'telegram',
      account_id: 'account:primary',
      channel_identity: '@principal',
    });
    const intake = await store.listApprovalIntake();
    const route = await store.getRouteDecision('550e8400-e29b-41d4-a716-446655440404');
    const delivery = await store.getLatestDeliveryAttemptByEgressId(
      '550e8400-e29b-41d4-a716-446655440407',
    );

    expect(binding?.binding_id).toBe('550e8400-e29b-41d4-a716-446655440401');
    expect(intake).toHaveLength(1);
    expect(route?.route_kind).toBe('project_message');
    expect(delivery?.outcome).toBe('delivered');
  });
});
