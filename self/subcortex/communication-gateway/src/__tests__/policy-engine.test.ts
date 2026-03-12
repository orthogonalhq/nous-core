import { describe, expect, it } from 'vitest';
import { CommunicationPolicyEngine } from '../policy-engine.js';

const NOW = '2026-03-11T00:00:00.000Z';

function createEngine() {
  return new CommunicationPolicyEngine({
    authorizedAccountIds: ['account:authorized'],
    allowGroupConversations: false,
    allowThreads: false,
    requireMentionForSharedConversations: true,
    now: () => NOW,
    idFactory: () => '550e8400-e29b-41d4-a716-446655440501',
  });
}

const ACTIVE_BINDING = {
  binding_id: '550e8400-e29b-41d4-a716-446655440502',
  channel: 'telegram' as const,
  account_id: 'account:authorized',
  channel_identity: '@principal',
  principal_id: 'principal',
  state: 'active' as const,
  approved_by: 'principal',
  approved_at: NOW,
  evidence_refs: ['binding:1'],
  created_at: NOW,
  updated_at: NOW,
};

describe('CommunicationPolicyEngine', () => {
  it('fails closed for unauthenticated ingress', () => {
    const decision = createEngine().evaluateIngress(
      {
        ingress_id: '550e8400-e29b-41d4-a716-446655440503',
        channel: 'telegram',
        channel_id: 'telegram:bot',
        workspace_id: null,
        account_id: 'account:authorized',
        conversation_id: 'chat:1',
        thread_id: null,
        message_id: 'message:1',
        sender_channel_identity: '@principal',
        bound_principal_id: null,
        mention_state: 'direct',
        message_type: 'dm',
        payload_ref: 'project:message',
        idempotency_key: 'ingress:1',
        occurred_at: NOW,
        received_at: NOW,
        auth_context_ref: null,
        trace_parent: null,
      },
      ACTIVE_BINDING,
    );

    expect(decision.reason_codes).toContain('unauthenticated_connector');
  });

  it('fails closed for unauthorized accounts', () => {
    const decision = createEngine().evaluateIngress(
      {
        ingress_id: '550e8400-e29b-41d4-a716-446655440504',
        channel: 'telegram',
        channel_id: 'telegram:bot',
        workspace_id: null,
        account_id: 'account:blocked',
        conversation_id: 'chat:1',
        thread_id: null,
        message_id: 'message:1',
        sender_channel_identity: '@principal',
        bound_principal_id: null,
        mention_state: 'direct',
        message_type: 'dm',
        payload_ref: 'project:message',
        idempotency_key: 'ingress:2',
        occurred_at: NOW,
        received_at: NOW,
        auth_context_ref: 'auth:1',
        trace_parent: null,
      },
      ACTIVE_BINDING,
    );

    expect(decision.reason_codes).toContain('unauthorized_channel');
  });

  it('fails closed for unbound identities', () => {
    const decision = createEngine().evaluateIngress(
      {
        ingress_id: '550e8400-e29b-41d4-a716-446655440505',
        channel: 'telegram',
        channel_id: 'telegram:bot',
        workspace_id: null,
        account_id: 'account:authorized',
        conversation_id: 'chat:1',
        thread_id: null,
        message_id: 'message:1',
        sender_channel_identity: '@unknown',
        bound_principal_id: null,
        mention_state: 'direct',
        message_type: 'dm',
        payload_ref: 'project:message',
        idempotency_key: 'ingress:3',
        occurred_at: NOW,
        received_at: NOW,
        auth_context_ref: 'auth:1',
        trace_parent: null,
      },
      null,
    );

    expect(decision.reason_codes).toContain('identity_unbound');
  });

  it('fails closed when shared conversations lack a direct mention', () => {
    const decision = createEngine().evaluateIngress(
      {
        ingress_id: '550e8400-e29b-41d4-a716-446655440506',
        channel: 'telegram',
        channel_id: 'telegram:bot',
        workspace_id: null,
        account_id: 'account:authorized',
        conversation_id: 'chat:group',
        thread_id: null,
        message_id: 'message:1',
        sender_channel_identity: '@principal',
        bound_principal_id: 'principal',
        mention_state: 'none',
        message_type: 'group',
        payload_ref: 'project:message',
        idempotency_key: 'ingress:4',
        occurred_at: NOW,
        received_at: NOW,
        auth_context_ref: 'auth:1',
        trace_parent: null,
      },
      ACTIVE_BINDING,
    );

    expect(decision.reason_codes).toContain('mention_required');
  });

  it('fails closed for disallowed group conversations', () => {
    const decision = createEngine().evaluateIngress(
      {
        ingress_id: '550e8400-e29b-41d4-a716-446655440507',
        channel: 'telegram',
        channel_id: 'telegram:bot',
        workspace_id: null,
        account_id: 'account:authorized',
        conversation_id: 'chat:group',
        thread_id: null,
        message_id: 'message:1',
        sender_channel_identity: '@principal',
        bound_principal_id: 'principal',
        mention_state: 'direct',
        message_type: 'group',
        payload_ref: 'project:message',
        idempotency_key: 'ingress:5',
        occurred_at: NOW,
        received_at: NOW,
        auth_context_ref: 'auth:1',
        trace_parent: null,
      },
      ACTIVE_BINDING,
    );

    expect(decision.reason_codes).toContain('conversation_not_allowed');
  });

  it('fails closed for disallowed thread traffic', () => {
    const decision = createEngine().evaluateIngress(
      {
        ingress_id: '550e8400-e29b-41d4-a716-446655440508',
        channel: 'telegram',
        channel_id: 'telegram:bot',
        workspace_id: null,
        account_id: 'account:authorized',
        conversation_id: 'chat:group',
        thread_id: 'thread:1',
        message_id: 'message:1',
        sender_channel_identity: '@principal',
        bound_principal_id: 'principal',
        mention_state: 'direct',
        message_type: 'thread',
        payload_ref: 'project:message',
        idempotency_key: 'ingress:6',
        occurred_at: NOW,
        received_at: NOW,
        auth_context_ref: 'auth:1',
        trace_parent: null,
      },
      ACTIVE_BINDING,
    );

    expect(decision.reason_codes).toContain('thread_not_allowed');
  });
});
