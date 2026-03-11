import { describe, expect, it } from 'vitest';
import { BindingStore } from '../binding-store.js';
import { DeliveryOrchestrator } from '../delivery-orchestrator.js';
import { DocumentCommunicationStore } from '../document-communication-store.js';
import { createMemoryDocumentStore } from './test-store.js';

const NOW = '2026-03-11T00:00:00.000Z';

async function createBindingStore() {
  const store = new DocumentCommunicationStore(createMemoryDocumentStore());
  const bindingStore = new BindingStore(store, {
    now: () => NOW,
    idFactory: (() => {
      let sequence = 0;
      return () => `550e8400-e29b-41d4-a716-44665544070${sequence++}`;
    })(),
  });
  const primary = await bindingStore.upsert({
    channel: 'telegram',
    account_id: 'account:primary',
    channel_identity: '@principal',
    principal_id: 'principal',
    requested_state: 'active',
    approved_by: 'principal',
    approval_reason: 'verified',
    failover_group_ref: 'group:1',
    evidence_refs: ['binding:primary'],
  });
  await bindingStore.upsert({
    channel: 'telegram',
    account_id: 'account:primary',
    channel_identity: '@principal:alt',
    principal_id: 'principal',
    requested_state: 'active',
    approved_by: 'principal',
    approval_reason: 'verified',
    failover_group_ref: 'group:1',
    evidence_refs: ['binding:failover'],
  });
  return { store, bindingStore, primary };
}

describe('DeliveryOrchestrator', () => {
  it('retries within budget and eventually delivers', async () => {
    const { store, bindingStore, primary } = await createBindingStore();
    let calls = 0;
    const orchestrator = new DeliveryOrchestrator({
      store,
      bindingStore,
      now: () => NOW,
      idFactory: (() => {
        let sequence = 1;
        return () => `550e8400-e29b-41d4-a716-44665544071${sequence++}`;
      })(),
      provider: {
        async send() {
          calls += 1;
          if (calls === 1) {
            return {
              outcome: 'failed',
              retryable: true,
              failure_class: 'retryable_transient',
              reason: 'permanent_delivery_failure',
            } as const;
          }
          return {
            outcome: 'delivered',
            provider_message_ref: 'telegram:message:1',
          } as const;
        },
      },
    });

    const attempt = await orchestrator.dispatch(
      {
        egress_id: '550e8400-e29b-41d4-a716-446655440720',
        channel: 'telegram',
        channel_id: 'telegram:bot',
        workspace_id: null,
        account_id: 'account:primary',
        conversation_id: 'chat:1',
        thread_id: null,
        recipient_binding_ref: primary.binding_id,
        message_class: 'response',
        payload_ref: 'project:message',
        delivery_policy_ref: 'delivery:default',
        retry_policy_ref: 'retry:1',
        requested_at: NOW,
        trace_parent: null,
      },
      {
        route_id: '550e8400-e29b-41d4-a716-446655440721',
        route_kind: 'project_message',
        route_key: 'project:message',
        policy_decision_id: '550e8400-e29b-41d4-a716-446655440722',
        precedence_rank: 3,
        rule_id: 'route:project-message',
        evidence_refs: ['route:1'],
        created_at: NOW,
      },
      primary,
    );

    expect(calls).toBe(2);
    expect(attempt.outcome).toBe('delivered');
  });

  it('fails closed on unknown external effect', async () => {
    const { store, bindingStore, primary } = await createBindingStore();
    const orchestrator = new DeliveryOrchestrator({
      store,
      bindingStore,
      now: () => NOW,
      provider: {
        async send() {
          return { outcome: 'unknown_external_effect' } as const;
        },
      },
    });

    const attempt = await orchestrator.dispatch(
      {
        egress_id: '550e8400-e29b-41d4-a716-446655440723',
        channel: 'telegram',
        channel_id: 'telegram:bot',
        workspace_id: null,
        account_id: 'account:primary',
        conversation_id: 'chat:1',
        thread_id: null,
        recipient_binding_ref: primary.binding_id,
        message_class: 'response',
        payload_ref: 'project:message',
        delivery_policy_ref: 'delivery:default',
        retry_policy_ref: 'retry:1',
        requested_at: NOW,
        trace_parent: null,
      },
      {
        route_id: '550e8400-e29b-41d4-a716-446655440724',
        route_kind: 'project_message',
        route_key: 'project:message',
        policy_decision_id: '550e8400-e29b-41d4-a716-446655440725',
        precedence_rank: 3,
        rule_id: 'route:project-message',
        evidence_refs: ['route:1'],
        created_at: NOW,
      },
      primary,
    );

    expect(attempt.outcome).toBe('review_required');
    expect(attempt.failure_class).toBe('unknown_external_effect');
  });

  it('blocks failover that crosses an unapproved binding boundary', async () => {
    const { store, bindingStore, primary } = await createBindingStore();
    const orchestrator = new DeliveryOrchestrator({
      store,
      bindingStore,
      now: () => NOW,
      provider: {
        async send() {
          return {
            outcome: 'failed',
            retryable: false,
            reason: 'permanent_delivery_failure',
            suggested_failover_binding_ref: '550e8400-e29b-41d4-a716-446655440799',
          } as const;
        },
      },
    });

    const attempt = await orchestrator.dispatch(
      {
        egress_id: '550e8400-e29b-41d4-a716-446655440726',
        channel: 'telegram',
        channel_id: 'telegram:bot',
        workspace_id: null,
        account_id: 'account:primary',
        conversation_id: 'chat:1',
        thread_id: null,
        recipient_binding_ref: primary.binding_id,
        message_class: 'response',
        payload_ref: 'project:message',
        delivery_policy_ref: 'delivery:default',
        retry_policy_ref: 'retry:0',
        requested_at: NOW,
        trace_parent: null,
      },
      {
        route_id: '550e8400-e29b-41d4-a716-446655440727',
        route_kind: 'project_message',
        route_key: 'project:message',
        policy_decision_id: '550e8400-e29b-41d4-a716-446655440728',
        precedence_rank: 3,
        rule_id: 'route:project-message',
        evidence_refs: ['route:1'],
        created_at: NOW,
      },
      primary,
    );

    expect(attempt.outcome).toBe('delivery_blocked');
    expect(attempt.reason_codes).toContain('policy_blocked');
  });
});
