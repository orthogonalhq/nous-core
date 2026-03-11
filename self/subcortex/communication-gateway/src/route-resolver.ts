import { randomUUID } from 'node:crypto';
import type {
  ChannelEgressEnvelope,
  ChannelIngressEnvelope,
  CommunicationPolicyDecision,
  CommunicationRouteDecision,
  EscalationId,
  ProjectId,
} from '@nous/shared';
import {
  CommunicationRouteDecisionSchema,
  EscalationIdSchema,
  ProjectIdSchema,
} from '@nous/shared';

export interface RouteResolverOptions {
  now?: () => string;
  idFactory?: () => string;
}

function parseEscalationId(payloadRef: string): EscalationId | undefined {
  const value = payloadRef.replace('escalation_ack:', '');
  const parsed = EscalationIdSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function parseProjectId(value: string): ProjectId | undefined {
  const match = value.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  );
  if (!match) {
    return undefined;
  }
  const parsed = ProjectIdSchema.safeParse(match[1]);
  return parsed.success ? parsed.data : undefined;
}

export class RouteResolver {
  private readonly now: () => string;
  private readonly idFactory: () => string;

  constructor(options: RouteResolverOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? randomUUID;
  }

  resolveApprovalIntake(
    policyDecisionId: string,
  ): CommunicationRouteDecision {
    return CommunicationRouteDecisionSchema.parse({
      route_id: this.idFactory(),
      route_kind: 'approval_intake',
      route_key: 'approval:intake',
      policy_decision_id: policyDecisionId,
      precedence_rank: 0,
      rule_id: 'route:approval-intake',
      evidence_refs: ['route:approval-intake'],
      created_at: this.now(),
    });
  }

  resolveIngress(
    envelope: ChannelIngressEnvelope,
    policy: CommunicationPolicyDecision,
  ): CommunicationRouteDecision {
    return this.resolvePayloadRoute(envelope.payload_ref, envelope.conversation_id, policy);
  }

  resolveEgress(
    envelope: ChannelEgressEnvelope,
    policy: CommunicationPolicyDecision,
  ): CommunicationRouteDecision {
    return this.resolvePayloadRoute(envelope.payload_ref, envelope.conversation_id, policy);
  }

  private resolvePayloadRoute(
    payloadRef: string,
    conversationId: string,
    policy: CommunicationPolicyDecision,
  ): CommunicationRouteDecision {
    if (payloadRef.startsWith('conflict:')) {
      throw new Error('route_conflict');
    }

    if (payloadRef.startsWith('escalation_ack:')) {
      const escalationId = parseEscalationId(payloadRef);
      if (!escalationId) {
        throw new Error('route_conflict');
      }
      return CommunicationRouteDecisionSchema.parse({
        route_id: this.idFactory(),
        route_kind: 'escalation_acknowledgement',
        route_key: payloadRef,
        policy_decision_id: policy.decision_id,
        escalation_id: escalationId,
        precedence_rank: 0,
        rule_id: 'route:escalation-acknowledgement',
        evidence_refs: [`route:${payloadRef}`],
        created_at: this.now(),
      });
    }

    if (payloadRef.startsWith('advisory:')) {
      return CommunicationRouteDecisionSchema.parse({
        route_id: this.idFactory(),
        route_kind: 'advisory_delivery',
        route_key: payloadRef,
        policy_decision_id: policy.decision_id,
        project_id: parseProjectId(conversationId),
        nudge_candidate_id: payloadRef.replace('advisory:', ''),
        precedence_rank: 1,
        rule_id: 'route:advisory-delivery',
        evidence_refs: [`route:${payloadRef}`],
        created_at: this.now(),
      });
    }

    if (payloadRef.startsWith('system:')) {
      return CommunicationRouteDecisionSchema.parse({
        route_id: this.idFactory(),
        route_kind: 'system_notice',
        route_key: payloadRef,
        policy_decision_id: policy.decision_id,
        precedence_rank: 2,
        rule_id: 'route:system-notice',
        evidence_refs: [`route:${payloadRef}`],
        created_at: this.now(),
      });
    }

    return CommunicationRouteDecisionSchema.parse({
      route_id: this.idFactory(),
      route_kind: 'project_message',
      route_key: payloadRef,
      policy_decision_id: policy.decision_id,
      project_id: parseProjectId(conversationId) ?? parseProjectId(payloadRef),
      precedence_rank: 3,
      rule_id: 'route:project-message',
      evidence_refs: [`route:${payloadRef}`],
      created_at: this.now(),
    });
  }
}
