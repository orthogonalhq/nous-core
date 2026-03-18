import { describe, expect, it } from 'vitest';
import type {
  AcknowledgeInAppEscalationInput,
  IEscalationService,
  INudgeDiscoveryService,
} from '@nous/shared';
import { CommunicationGatewayService } from '../communication-gateway-service.js';
import { createMemoryDocumentStore } from './test-store.js';

const NOW = '2026-03-11T00:00:00.000Z';
const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440801' as any;

class MockEscalationService implements IEscalationService {
  acknowledgementInputs: AcknowledgeInAppEscalationInput[] = [];

  async notify(): Promise<any> {
    return '550e8400-e29b-41d4-a716-446655440802';
  }

  async checkResponse(): Promise<any> {
    return null;
  }

  async get(): Promise<any> {
    return null;
  }

  async listProjectQueue(): Promise<any[]> {
    return [];
  }

  async acknowledge(input: AcknowledgeInAppEscalationInput): Promise<any> {
    this.acknowledgementInputs.push(input);
    return {
      escalationId: input.escalationId,
      projectId: PROJECT_ID,
      source: 'workflow',
      severity: 'high',
      title: 'Ack',
      message: 'Acked',
      status: 'acknowledged',
      routeTargets: ['projects'],
      evidenceRefs: ['evidence:ack'],
      acknowledgements: [
        {
          surface: input.surface,
          actorType: input.actorType,
          acknowledgedAt: NOW,
          note: input.note,
          evidenceRefs: ['evidence:ack'],
        },
      ],
      createdAt: NOW,
      updatedAt: NOW,
    };
  }
}

class MockNudgeService implements INudgeDiscoveryService {
  prepareCalls: Array<Record<string, unknown>> = [];

  async recordSignal(): Promise<any> { throw new Error('not needed'); }
  async generateCandidates(): Promise<any> { throw new Error('not needed'); }
  async rankCandidates(): Promise<any> { throw new Error('not needed'); }
  async evaluateSuppression(): Promise<any> { throw new Error('not needed'); }
  async recordDelivery(): Promise<any> { throw new Error('not needed'); }
  async recordFeedback(): Promise<any> { throw new Error('not needed'); }
  async routeAcceptance(): Promise<any> { throw new Error('not needed'); }
  async applySuppression(): Promise<any> { throw new Error('not needed'); }
  async listSuppressions(): Promise<any> { throw new Error('not needed'); }
  async getRankingPolicy(): Promise<any> { throw new Error('not needed'); }

  async prepareSurfaceFeed(input: any): Promise<any> {
    this.prepareCalls.push(input);
    return {
      projectId: input.projectId,
      surface: input.surface,
      cards: [],
      blockedDeliveries: [
        {
          delivery_id: '550e8400-e29b-41d4-a716-446655440803',
          candidate_id: 'candidate-1',
          decision_id: 'decision-1',
          surface: 'communication_gateway',
          outcome: 'delivery_blocked',
          reason_codes: ['NDG-DELIVERY-BLOCKED-SUPPRESSION'],
          evidence_refs: [{ actionCategory: 'trace-persist' }],
          delivered_at: NOW,
        },
      ],
      generatedAt: NOW,
    };
  }
}

function buildAcknowledgementToken(input: {
  channel: 'telegram' | 'matrix' | 'slack';
  account_id: string;
  conversation_id: string;
  message_id: string;
  escalation_id: string;
  binding_id: string;
  acknowledged_by_principal_id: string;
}) {
  return [
    'ack',
    input.channel,
    input.account_id,
    input.conversation_id,
    input.message_id,
    input.escalation_id,
    input.binding_id,
    input.acknowledged_by_principal_id,
  ].join('|');
}

describe('CommunicationGatewayService', () => {
  it('records approval intake for unbound identities', async () => {
    const service = new CommunicationGatewayService({
      documentStore: createMemoryDocumentStore(),
      authorizedAccountIds: ['account:authorized'],
      allowGroupConversations: true,
      allowThreads: true,
      now: () => NOW,
      idFactory: (() => {
        let sequence = 0;
        return () => `550e8400-e29b-41d4-a716-44665544081${sequence++}`;
      })(),
    });

    const outcome = await service.receiveIngress({
      ingress_id: '550e8400-e29b-41d4-a716-446655440820',
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
      idempotency_key: 'ingress:1',
      occurred_at: NOW,
      received_at: NOW,
      auth_context_ref: 'auth:1',
      trace_parent: null,
    });

    expect(outcome.outcome).toBe('approval_intake_recorded');
  });

  it('bridges escalation acknowledgements into the canonical escalation service', async () => {
    const escalationService = new MockEscalationService();
    const service = new CommunicationGatewayService({
      documentStore: createMemoryDocumentStore(),
      escalationService,
      now: () => NOW,
      idFactory: (() => {
        let sequence = 0;
        return () => `550e8400-e29b-41d4-a716-44665544083${sequence++}`;
      })(),
    });

    const binding = await service.upsertBinding({
      channel: 'telegram',
      account_id: 'account:authorized',
      channel_identity: '@principal',
      principal_id: 'principal',
      requested_state: 'active',
      approved_by: 'principal',
      approval_reason: 'verified',
      evidence_refs: ['binding:1'],
    });
    const escalationId = '550e8400-e29b-41d4-a716-446655440804';

    const acknowledged = await service.acknowledgeEscalation({
      escalation_id: escalationId as any,
      binding_id: binding.binding_id,
      acknowledged_by_principal_id: 'principal',
      channel: 'telegram',
      account_id: 'account:authorized',
      conversation_id: 'chat:1',
      message_id: 'message:1',
      acknowledgement_token: buildAcknowledgementToken({
        channel: 'telegram',
        account_id: 'account:authorized',
        conversation_id: 'chat:1',
        message_id: 'message:1',
        escalation_id: escalationId,
        binding_id: binding.binding_id,
        acknowledged_by_principal_id: 'principal',
      }),
      acknowledged_at: NOW,
      evidence_refs: ['evidence:ack'],
    });

    expect(acknowledged?.status).toBe('acknowledged');
    expect(escalationService.acknowledgementInputs[0]?.surface).toBe(
      'communication_gateway',
    );
  });

  it('rejects escalation acknowledgements when token context does not match the active binding', async () => {
    const escalationService = new MockEscalationService();
    const service = new CommunicationGatewayService({
      documentStore: createMemoryDocumentStore(),
      escalationService,
      now: () => NOW,
      idFactory: (() => {
        let sequence = 0;
        return () => `550e8400-e29b-41d4-a716-44665544086${sequence++}`;
      })(),
    });

    const binding = await service.upsertBinding({
      channel: 'telegram',
      account_id: 'account:authorized',
      channel_identity: '@principal',
      principal_id: 'principal',
      requested_state: 'active',
      approved_by: 'principal',
      approval_reason: 'verified',
      evidence_refs: ['binding:1'],
    });

    const acknowledged = await service.acknowledgeEscalation({
      escalation_id: '550e8400-e29b-41d4-a716-446655440807' as any,
      binding_id: binding.binding_id,
      acknowledged_by_principal_id: 'principal',
      channel: 'telegram',
      account_id: 'account:other',
      conversation_id: 'chat:1',
      message_id: 'message:1',
      acknowledgement_token: 'ack|telegram|account:authorized|chat:1|message:1|550e8400-e29b-41d4-a716-446655440807|' + binding.binding_id + '|principal',
      acknowledged_at: NOW,
      evidence_refs: ['evidence:ack'],
    });

    expect(acknowledged).toBeNull();
    expect(escalationService.acknowledgementInputs).toHaveLength(0);
  });

  it('rejects escalation acknowledgements when the acknowledgement token is invalid', async () => {
    const escalationService = new MockEscalationService();
    const service = new CommunicationGatewayService({
      documentStore: createMemoryDocumentStore(),
      escalationService,
      now: () => NOW,
      idFactory: (() => {
        let sequence = 0;
        return () => `550e8400-e29b-41d4-a716-44665544087${sequence++}`;
      })(),
    });

    const binding = await service.upsertBinding({
      channel: 'telegram',
      account_id: 'account:authorized',
      channel_identity: '@principal',
      principal_id: 'principal',
      requested_state: 'active',
      approved_by: 'principal',
      approval_reason: 'verified',
      evidence_refs: ['binding:1'],
    });

    const acknowledged = await service.acknowledgeEscalation({
      escalation_id: '550e8400-e29b-41d4-a716-446655440808' as any,
      binding_id: binding.binding_id,
      acknowledged_by_principal_id: 'principal',
      channel: 'telegram',
      account_id: 'account:authorized',
      conversation_id: 'chat:1',
      message_id: 'message:1',
      acknowledgement_token: 'ack|invalid',
      acknowledged_at: NOW,
      evidence_refs: ['evidence:ack'],
    });

    expect(acknowledged).toBeNull();
    expect(escalationService.acknowledgementInputs).toHaveLength(0);
  });

  it('blocks advisory egress through the communication_gateway surface when nudge delivery is suppressed', async () => {
    const nudgeService = new MockNudgeService();
    const service = new CommunicationGatewayService({
      documentStore: createMemoryDocumentStore(),
      nudgeDiscoveryService: nudgeService,
      deliveryProvider: {
        async send() {
          return {
            outcome: 'delivered',
            provider_message_ref: 'telegram:message:1',
          } as const;
        },
      },
      now: () => NOW,
      idFactory: (() => {
        let sequence = 0;
        return () => `550e8400-e29b-41d4-a716-44665544084${sequence++}`;
      })(),
    });

    const binding = await service.upsertBinding({
      channel: 'telegram',
      account_id: 'account:authorized',
      channel_identity: '@principal',
      principal_id: 'principal',
      requested_state: 'active',
      approved_by: 'principal',
      approval_reason: 'verified',
      evidence_refs: ['binding:1'],
    });

    const outcome = await service.dispatchEgress({
      egress_id: '550e8400-e29b-41d4-a716-446655440805',
      channel: 'telegram',
      channel_id: 'telegram:bot',
      workspace_id: null,
      account_id: 'account:authorized',
      conversation_id: 'project:550e8400-e29b-41d4-a716-446655440806',
      thread_id: null,
      recipient_binding_ref: binding.binding_id,
      message_class: 'alert',
      payload_ref: 'advisory:persona-engine',
      delivery_policy_ref: 'delivery:default',
      retry_policy_ref: 'retry:0',
      requested_at: NOW,
      trace_parent: null,
    });

    expect(outcome.outcome).toBe('blocked');
    expect(nudgeService.prepareCalls[0]?.surface).toBe('communication_gateway');
    expect(outcome.attempt.egress_id).toBe(
      '550e8400-e29b-41d4-a716-446655440805',
    );
  });

  it('tracks host-owned connector registrations and session reports', () => {
    const service = new CommunicationGatewayService({
      documentStore: createMemoryDocumentStore(),
      now: () => NOW,
    });

    const registration = service.registerConnector({
      connector_id: 'connector:telegram:account:authorized',
      kind: 'telegram',
      account_id: 'account:authorized',
      project_id: PROJECT_ID,
    });
    const session = service.reportConnectorSession({
      connector_id: 'connector:telegram:account:authorized',
      status: 'active',
      health: 'healthy',
      last_seen_at: NOW,
      metadata: {
        session_id: 'session-1',
        mode: 'connector',
      },
    });

    expect(registration.status).toBe('registered');
    expect(service.getConnectorRegistration(registration.connector_id)?.project_id).toBe(
      PROJECT_ID,
    );
    expect(session.metadata).toMatchObject({
      session_id: 'session-1',
      mode: 'connector',
    });

    service.unregisterConnector(registration.connector_id);
    expect(service.getConnectorRegistration(registration.connector_id)).toBeNull();
    expect(service.getConnectorSession(registration.connector_id)).toBeNull();
  });
});
