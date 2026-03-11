import { describe, expect, it } from 'vitest';
import { RouteResolver } from '../route-resolver.js';

const POLICY = {
  decision_id: '550e8400-e29b-41d4-a716-446655440601',
  connector_authenticated: true,
  account_authorized: true,
  binding_state: 'active' as const,
  mention_policy_allowed: true,
  conversation_policy_allowed: true,
  thread_policy_allowed: true,
  reason_codes: [],
  evidence_refs: ['policy:1'],
  evaluated_at: '2026-03-11T00:00:00.000Z',
};

describe('RouteResolver', () => {
  it('routes escalation acknowledgements before project messages', () => {
    const resolver = new RouteResolver({
      now: () => '2026-03-11T00:00:00.000Z',
      idFactory: () => '550e8400-e29b-41d4-a716-446655440602',
    });

    const route = resolver.resolveIngress(
      {
        ingress_id: '550e8400-e29b-41d4-a716-446655440603',
        channel: 'telegram',
        channel_id: 'telegram:bot',
        workspace_id: null,
        account_id: 'account:primary',
        conversation_id: 'project:550e8400-e29b-41d4-a716-446655440604',
        thread_id: null,
        message_id: 'message:1',
        sender_channel_identity: '@principal',
        bound_principal_id: 'principal',
        mention_state: 'direct',
        message_type: 'dm',
        payload_ref: 'escalation_ack:550e8400-e29b-41d4-a716-446655440605',
        idempotency_key: 'ingress:1',
        occurred_at: '2026-03-11T00:00:00.000Z',
        received_at: '2026-03-11T00:00:00.000Z',
        auth_context_ref: 'auth:1',
        trace_parent: null,
      },
      POLICY,
    );

    expect(route.route_kind).toBe('escalation_acknowledgement');
    expect(route.precedence_rank).toBe(0);
  });

  it('fails closed when payload routing is ambiguous', () => {
    const resolver = new RouteResolver();

    expect(() =>
      resolver.resolveIngress(
        {
          ingress_id: '550e8400-e29b-41d4-a716-446655440606',
          channel: 'telegram',
          channel_id: 'telegram:bot',
          workspace_id: null,
          account_id: 'account:primary',
          conversation_id: 'chat:1',
          thread_id: null,
          message_id: 'message:1',
          sender_channel_identity: '@principal',
          bound_principal_id: 'principal',
          mention_state: 'direct',
          message_type: 'dm',
          payload_ref: 'conflict:payload',
          idempotency_key: 'ingress:2',
          occurred_at: '2026-03-11T00:00:00.000Z',
          received_at: '2026-03-11T00:00:00.000Z',
          auth_context_ref: 'auth:1',
          trace_parent: null,
        },
        POLICY,
      ),
    ).toThrow('route_conflict');
  });
});
