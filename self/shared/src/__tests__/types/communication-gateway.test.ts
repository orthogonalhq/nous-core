import { describe, expect, it } from 'vitest';
import {
  ChannelEgressEnvelopeSchema,
  ChannelIngressEnvelopeSchema,
  CommunicationConnectorRegistrationSchema,
  CommunicationConnectorSessionSchema,
  CommunicationEgressOutcomeSchema,
  CommunicationEscalationAcknowledgementInputSchema,
  CommunicationIdentityBindingUpsertInputSchema,
  CommunicationIngressOutcomeSchema,
  CommunicationPolicyDecisionSchema,
  CommunicationRouteDecisionSchema,
} from '../../types/communication-gateway.js';

const NOW = '2026-03-11T00:00:00.000Z';
const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440111';
const ESCALATION_ID = '550e8400-e29b-41d4-a716-446655440112';

describe('ChannelIngressEnvelopeSchema', () => {
  it('parses normalized ingress envelopes', () => {
    const result = ChannelIngressEnvelopeSchema.safeParse({
      ingress_id: '550e8400-e29b-41d4-a716-446655440101',
      channel: 'telegram',
      channel_id: 'telegram:bot',
      workspace_id: null,
      account_id: 'account:primary',
      conversation_id: 'chat:123',
      thread_id: null,
      message_id: 'message:1',
      sender_channel_identity: '@principal',
      bound_principal_id: 'principal',
      mention_state: 'direct',
      message_type: 'dm',
      payload_ref: 'payload:1',
      idempotency_key: 'ingress:1',
      occurred_at: NOW,
      received_at: NOW,
      auth_context_ref: 'auth:1',
      trace_parent: null,
    });

    expect(result.success).toBe(true);
  });
});

describe('ChannelEgressEnvelopeSchema', () => {
  it('parses canonical egress envelopes', () => {
    const result = ChannelEgressEnvelopeSchema.safeParse({
      egress_id: '550e8400-e29b-41d4-a716-446655440102',
      channel: 'telegram',
      channel_id: 'telegram:bot',
      workspace_id: null,
      account_id: 'account:primary',
      conversation_id: 'chat:123',
      thread_id: null,
      recipient_binding_ref: '550e8400-e29b-41d4-a716-446655440103',
      message_class: 'escalation',
      payload_ref: 'payload:2',
      delivery_policy_ref: 'delivery:default',
      retry_policy_ref: 'retry:default',
      requested_at: NOW,
      trace_parent: null,
    });

    expect(result.success).toBe(true);
  });
});

describe('CommunicationIdentityBindingUpsertInputSchema', () => {
  it('requires approval evidence for governed binding changes', () => {
    const result = CommunicationIdentityBindingUpsertInputSchema.safeParse({
      channel: 'telegram',
      account_id: 'account:primary',
      channel_identity: '@principal',
      principal_id: 'principal',
      requested_state: 'active',
      approved_by: 'principal',
      approval_reason: 'Verified Telegram identity',
      evidence_refs: ['approval:telegram-binding'],
    });

    expect(result.success).toBe(true);
  });
});

describe('CommunicationPolicyDecisionSchema', () => {
  it('parses policy decisions with explicit failure reasons', () => {
    const result = CommunicationPolicyDecisionSchema.safeParse({
      decision_id: '550e8400-e29b-41d4-a716-446655440104',
      ingress_id: '550e8400-e29b-41d4-a716-446655440101',
      connector_authenticated: true,
      account_authorized: false,
      binding_state: 'unbound',
      mention_policy_allowed: false,
      conversation_policy_allowed: true,
      thread_policy_allowed: true,
      reason_codes: ['identity_unbound', 'mention_required'],
      evidence_refs: ['evidence:policy'],
      evaluated_at: NOW,
    });

    expect(result.success).toBe(true);
  });
});

describe('CommunicationRouteDecisionSchema', () => {
  it('parses canonical route decisions for escalations and project-scoped traffic', () => {
    const result = CommunicationRouteDecisionSchema.safeParse({
      route_id: '550e8400-e29b-41d4-a716-446655440105',
      route_kind: 'escalation_acknowledgement',
      route_key: 'escalation:ack',
      policy_decision_id: '550e8400-e29b-41d4-a716-446655440104',
      project_id: PROJECT_ID,
      escalation_id: ESCALATION_ID,
      precedence_rank: 0,
      rule_id: 'route:escalation-ack',
      evidence_refs: ['evidence:route'],
      created_at: NOW,
    });

    expect(result.success).toBe(true);
  });
});

describe('CommunicationEscalationAcknowledgementInputSchema', () => {
  it('parses authority-sensitive acknowledgement bridge inputs', () => {
    const result = CommunicationEscalationAcknowledgementInputSchema.safeParse({
      escalation_id: ESCALATION_ID,
      binding_id: '550e8400-e29b-41d4-a716-446655440103',
      acknowledged_by_principal_id: 'principal',
      channel: 'telegram',
      account_id: 'account:primary',
      conversation_id: 'chat:123',
      message_id: 'message:1',
      acknowledgement_token: 'ack:token',
      acknowledged_at: NOW,
      evidence_refs: ['evidence:ack'],
    });

    expect(result.success).toBe(true);
  });
});

describe('Communication connector runtime schemas', () => {
  it('parses canonical connector registrations and sessions', () => {
    const registration = CommunicationConnectorRegistrationSchema.safeParse({
      connector_id: 'connector:telegram:account:primary',
      kind: 'telegram',
      account_id: 'account:primary',
      status: 'registered',
      registered_at: NOW,
    });
    const session = CommunicationConnectorSessionSchema.safeParse({
      connector_id: 'connector:telegram:account:primary',
      status: 'active',
      health: 'healthy',
      last_seen_at: NOW,
      metadata: {
        last_ingress_id: '550e8400-e29b-41d4-a716-446655440101',
      },
    });

    expect(registration.success).toBe(true);
    expect(session.success).toBe(true);
  });
});

describe('CommunicationIngressOutcomeSchema', () => {
  it('parses approval-intake outcomes for unbound identities', () => {
    const result = CommunicationIngressOutcomeSchema.safeParse({
      outcome: 'approval_intake_recorded',
      intake: {
        intake_id: '550e8400-e29b-41d4-a716-446655440106',
        channel: 'telegram',
        account_id: 'account:primary',
        conversation_id: 'chat:123',
        channel_identity: '@principal',
        latest_ingress_id: '550e8400-e29b-41d4-a716-446655440101',
        status: 'pending',
        evidence_refs: ['evidence:intake'],
        first_seen_at: NOW,
        last_seen_at: NOW,
      },
      policy: {
        decision_id: '550e8400-e29b-41d4-a716-446655440104',
        ingress_id: '550e8400-e29b-41d4-a716-446655440101',
        connector_authenticated: true,
        account_authorized: true,
        binding_state: 'unbound',
        mention_policy_allowed: true,
        conversation_policy_allowed: true,
        thread_policy_allowed: true,
        reason_codes: ['identity_unbound'],
        evidence_refs: ['evidence:policy'],
        evaluated_at: NOW,
      },
      route: {
        route_id: '550e8400-e29b-41d4-a716-446655440107',
        route_kind: 'approval_intake',
        route_key: 'approval:intake',
        policy_decision_id: '550e8400-e29b-41d4-a716-446655440104',
        precedence_rank: 0,
        rule_id: 'route:approval-intake',
        evidence_refs: ['evidence:route'],
        created_at: NOW,
      },
    });

    expect(result.success).toBe(true);
  });
});

describe('CommunicationEgressOutcomeSchema', () => {
  it('parses blocked outcomes for unknown external effect status', () => {
    const result = CommunicationEgressOutcomeSchema.safeParse({
      outcome: 'failed_review_required',
      attempt: {
        delivery_attempt_id: '550e8400-e29b-41d4-a716-446655440108',
        route_id: '550e8400-e29b-41d4-a716-446655440105',
        egress_id: '550e8400-e29b-41d4-a716-446655440102',
        outcome: 'review_required',
        failure_class: 'unknown_external_effect',
        retry_budget_remaining: 0,
        reason_codes: ['unknown_external_effect'],
        evidence_refs: ['evidence:delivery'],
        occurred_at: NOW,
      },
    });

    expect(result.success).toBe(true);
  });
});
