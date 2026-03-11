import { randomUUID } from 'node:crypto';
import type {
  ChannelEgressEnvelope,
  ChannelIngressEnvelope,
  CommunicationApprovalIntakeRecord,
  CommunicationEgressOutcome,
  CommunicationEscalationAcknowledgementInput,
  CommunicationIdentityBindingRecord,
  CommunicationIdentityBindingUpsertInput,
  CommunicationIngressOutcome,
  CommunicationRejectReason,
  CommunicationRouteDecision,
  ICommunicationGatewayService,
  IDocumentStore,
  IEscalationService,
  INudgeDiscoveryService,
  IWitnessService,
  InAppEscalationRecord,
  ProjectId,
} from '@nous/shared';
import {
  ChannelEgressEnvelopeSchema,
  ChannelIngressEnvelopeSchema,
  CommunicationEscalationAcknowledgementInputSchema,
  CommunicationEgressOutcomeSchema,
  CommunicationIdentityBindingUpsertInputSchema,
  CommunicationIngressOutcomeSchema,
} from '@nous/shared';
import { ApprovalIntakeStore } from './approval-intake-store.js';
import { BindingStore } from './binding-store.js';
import {
  type CommunicationDeliveryProvider,
  DeliveryOrchestrator,
} from './delivery-orchestrator.js';
import { DocumentCommunicationStore } from './document-communication-store.js';
import { CommunicationPolicyEngine } from './policy-engine.js';
import { RouteResolver } from './route-resolver.js';

export interface CommunicationGatewayServiceOptions {
  documentStore?: IDocumentStore;
  communicationStore?: DocumentCommunicationStore;
  bindingStore?: BindingStore;
  approvalIntakeStore?: ApprovalIntakeStore;
  policyEngine?: CommunicationPolicyEngine;
  routeResolver?: RouteResolver;
  deliveryOrchestrator?: DeliveryOrchestrator;
  deliveryProvider?: CommunicationDeliveryProvider;
  escalationService?: IEscalationService;
  nudgeDiscoveryService?: INudgeDiscoveryService;
  witnessService?: IWitnessService;
  authorizedAccountIds?: readonly string[];
  allowGroupConversations?: boolean;
  allowThreads?: boolean;
  requireMentionForSharedConversations?: boolean;
  now?: () => string;
  idFactory?: () => string;
}

export class CommunicationGatewayService implements ICommunicationGatewayService {
  private readonly store: DocumentCommunicationStore;
  private readonly bindingStore: BindingStore;
  private readonly approvalIntakeStore: ApprovalIntakeStore;
  private readonly policyEngine: CommunicationPolicyEngine;
  private readonly routeResolver: RouteResolver;
  private readonly deliveryOrchestrator?: DeliveryOrchestrator;
  private readonly now: () => string;
  private readonly idFactory: () => string;

  constructor(private readonly options: CommunicationGatewayServiceOptions) {
    if (!options.communicationStore && !options.documentStore) {
      throw new Error(
        'CommunicationGatewayService requires documentStore or communicationStore',
      );
    }

    this.now = options.now ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? randomUUID;
    this.store =
      options.communicationStore ?? new DocumentCommunicationStore(options.documentStore!);
    this.bindingStore =
      options.bindingStore ??
      new BindingStore(this.store, {
        now: this.now,
        idFactory: this.idFactory,
      });
    this.approvalIntakeStore =
      options.approvalIntakeStore ??
      new ApprovalIntakeStore(this.store, {
        now: this.now,
        idFactory: this.idFactory,
      });
    this.policyEngine =
      options.policyEngine ??
      new CommunicationPolicyEngine({
        authorizedAccountIds: options.authorizedAccountIds,
        allowGroupConversations: options.allowGroupConversations,
        allowThreads: options.allowThreads,
        requireMentionForSharedConversations:
          options.requireMentionForSharedConversations,
        now: this.now,
        idFactory: this.idFactory,
      });
    this.routeResolver =
      options.routeResolver ??
      new RouteResolver({
        now: this.now,
        idFactory: this.idFactory,
      });
    this.deliveryOrchestrator = options.deliveryOrchestrator ??
      (options.deliveryProvider
        ? new DeliveryOrchestrator({
            store: this.store,
            bindingStore: this.bindingStore,
            provider: options.deliveryProvider,
            now: this.now,
            idFactory: this.idFactory,
          })
        : undefined);
  }

  async receiveIngress(
    envelope: ChannelIngressEnvelope,
  ): Promise<CommunicationIngressOutcome> {
    const parsed = ChannelIngressEnvelopeSchema.parse(envelope);
    const binding = await this.bindingStore.findByIdentity({
      channel: parsed.channel,
      account_id: parsed.account_id,
      channel_identity: parsed.sender_channel_identity,
    });
    const policy = this.policyEngine.evaluateIngress(parsed, binding);

    if (this.policyEngine.isApprovalIntakeEligible(policy)) {
      const route = await this.store.saveRouteDecision(
        this.routeResolver.resolveApprovalIntake(policy.decision_id),
      );
      const intake = await this.approvalIntakeStore.recordFromIngress(
        parsed,
        [...new Set([...policy.evidence_refs, ...route.evidence_refs])],
      );
      await this.recordWitness(`communication-ingress:${parsed.ingress_id}`, 'blocked', {
        routeKind: route.route_kind,
        reasonCodes: policy.reason_codes,
      });

      return CommunicationIngressOutcomeSchema.parse({
        outcome: 'approval_intake_recorded',
        intake,
        policy,
        route,
      });
    }

    if (!this.policyEngine.isIngressAllowed(policy)) {
      const reason = this.selectRejectReason(policy.reason_codes);
      await this.recordWitness(`communication-ingress:${parsed.ingress_id}`, 'blocked', {
        reason,
        reasonCodes: policy.reason_codes,
      });

      return CommunicationIngressOutcomeSchema.parse({
        outcome: 'rejected',
        reason,
        policy,
        evidence_refs: [...new Set([...policy.evidence_refs, `reject:${parsed.ingress_id}`])],
      });
    }

    try {
      const route = await this.store.saveRouteDecision(
        this.routeResolver.resolveIngress(parsed, policy),
      );
      await this.recordWitness(`communication-ingress:${parsed.ingress_id}`, 'succeeded', {
        routeKind: route.route_kind,
        routeId: route.route_id,
      });

      return CommunicationIngressOutcomeSchema.parse({
        outcome: 'accepted_routed',
        policy,
        route,
      });
    } catch {
      const rejectedPolicy = {
        ...policy,
        reason_codes: [...new Set([...policy.reason_codes, 'route_conflict'])],
        evidence_refs: [...new Set([...policy.evidence_refs, `reject:${parsed.ingress_id}`])],
      };
      await this.recordWitness(`communication-ingress:${parsed.ingress_id}`, 'blocked', {
        reason: 'route_conflict',
      });

      return CommunicationIngressOutcomeSchema.parse({
        outcome: 'rejected',
        reason: 'route_conflict',
        policy: rejectedPolicy,
        evidence_refs: rejectedPolicy.evidence_refs,
      });
    }
  }

  async dispatchEgress(
    envelope: ChannelEgressEnvelope,
  ): Promise<CommunicationEgressOutcome> {
    const parsed = ChannelEgressEnvelopeSchema.parse(envelope);
    if (!this.deliveryOrchestrator) {
      throw new Error('dispatchEgress requires a delivery provider');
    }

    const binding = await this.bindingStore.get(parsed.recipient_binding_ref);
    const policy = this.policyEngine.evaluateEgress(parsed, binding);
    if (!this.policyEngine.isEgressAllowed(policy)) {
      const attempt = await this.store.saveDeliveryAttempt({
        delivery_attempt_id: this.idFactory(),
        route_id: this.idFactory(),
        egress_id: parsed.egress_id,
        outcome: 'delivery_blocked',
        retry_budget_remaining: 0,
        reason_codes: policy.reason_codes,
        evidence_refs: [...new Set([...policy.evidence_refs, `delivery:${parsed.egress_id}`])],
        occurred_at: this.now(),
      });
      await this.recordWitness(`communication-egress:${parsed.egress_id}`, 'blocked', {
        reasonCodes: policy.reason_codes,
      });

      return CommunicationEgressOutcomeSchema.parse({
        outcome: 'blocked',
        attempt,
      });
    }

    const route = await this.store.saveRouteDecision(
      this.routeResolver.resolveEgress(parsed, policy),
    );
    const advisoryBlock = await this.maybeBlockAdvisory(route, parsed.egress_id);
    if (advisoryBlock) {
      await this.recordWitness(`communication-egress:${parsed.egress_id}`, 'blocked', {
        routeKind: route.route_kind,
        reasonCodes: advisoryBlock.reason_codes,
      });
      return CommunicationEgressOutcomeSchema.parse({
        outcome: 'blocked',
        attempt: advisoryBlock,
      });
    }

    const attempt = await this.deliveryOrchestrator.dispatch(parsed, route, binding!);
    await this.recordWitness(
      `communication-egress:${parsed.egress_id}`,
      attempt.outcome === 'review_required' ? 'blocked' : 'succeeded',
      {
        routeKind: route.route_kind,
        deliveryOutcome: attempt.outcome,
        reasonCodes: attempt.reason_codes,
      },
    );

    if (attempt.outcome === 'deduplicated') {
      return CommunicationEgressOutcomeSchema.parse({
        outcome: 'deduplicated',
        attempt,
      });
    }

    if (attempt.outcome === 'delivered') {
      return CommunicationEgressOutcomeSchema.parse({
        outcome: 'delivered',
        attempt,
      });
    }

    if (attempt.outcome === 'review_required') {
      return CommunicationEgressOutcomeSchema.parse({
        outcome: 'failed_review_required',
        attempt,
      });
    }

    return CommunicationEgressOutcomeSchema.parse({
      outcome: 'blocked',
      attempt,
    });
  }

  async upsertBinding(
    input: CommunicationIdentityBindingUpsertInput,
  ): Promise<CommunicationIdentityBindingRecord> {
    const parsed = CommunicationIdentityBindingUpsertInputSchema.parse(input);
    return this.bindingStore.upsert(parsed);
  }

  async listApprovalIntake(
    projectId?: ProjectId,
  ): Promise<CommunicationApprovalIntakeRecord[]> {
    return this.approvalIntakeStore.list(projectId);
  }

  async acknowledgeEscalation(
    input: CommunicationEscalationAcknowledgementInput,
  ): Promise<InAppEscalationRecord | null> {
    const parsed = CommunicationEscalationAcknowledgementInputSchema.parse(input);
    const binding = await this.bindingStore.get(parsed.binding_id);
    if (!binding || !this.options.escalationService) {
      await this.recordWitness(
        `communication-ack:${parsed.escalation_id}:${parsed.message_id}`,
        'blocked',
        {
          escalationId: parsed.escalation_id,
          acknowledged: false,
          reason: 'binding_missing_or_service_unavailable',
        },
      );
      return null;
    }

    if (!this.hasValidAcknowledgementContext(parsed, binding)) {
      await this.recordWitness(
        `communication-ack:${parsed.escalation_id}:${parsed.message_id}`,
        'blocked',
        {
          escalationId: parsed.escalation_id,
          acknowledged: false,
          reason: 'binding_context_mismatch',
        },
      );
      return null;
    }

    if (!this.hasValidAcknowledgementToken(parsed, binding)) {
      await this.recordWitness(
        `communication-ack:${parsed.escalation_id}:${parsed.message_id}`,
        'blocked',
        {
          escalationId: parsed.escalation_id,
          acknowledged: false,
          reason: 'invalid_acknowledgement_token',
        },
      );
      return null;
    }

    const acknowledged = await this.options.escalationService.acknowledge({
      escalationId: parsed.escalation_id,
      surface: 'communication_gateway',
      actorType: 'principal',
      note: `${parsed.channel}:${parsed.message_id}:${parsed.acknowledgement_token}`,
    });
    await this.recordWitness(
      `communication-ack:${parsed.escalation_id}:${parsed.message_id}`,
      acknowledged ? 'succeeded' : 'blocked',
      {
        escalationId: parsed.escalation_id,
        acknowledged: acknowledged != null,
      },
    );
    return acknowledged;
  }

  async getRouteDecision(routeId: string): Promise<CommunicationRouteDecision | null> {
    return this.store.getRouteDecision(routeId);
  }

  private async maybeBlockAdvisory(
    route: CommunicationRouteDecision,
    egressId: string,
  ) {
    if (
      route.route_kind !== 'advisory_delivery' ||
      !this.options.nudgeDiscoveryService
    ) {
      return null;
    }

    const feed = await this.options.nudgeDiscoveryService.prepareSurfaceFeed({
      projectId: route.project_id,
      surface: 'communication_gateway',
      signalRefs: route.nudge_candidate_id ? [route.nudge_candidate_id] : [route.route_key],
      limit: 1,
    });
    if (feed.cards.length > 0) {
      return null;
    }

    return this.store.saveDeliveryAttempt({
      delivery_attempt_id: this.idFactory(),
      route_id: route.route_id,
      egress_id: egressId,
      outcome: 'delivery_blocked',
      retry_budget_remaining: 0,
      reason_codes: ['policy_blocked'],
      evidence_refs: [`delivery:${egressId}`],
      occurred_at: this.now(),
    });
  }

  private hasValidAcknowledgementContext(
    input: CommunicationEscalationAcknowledgementInput,
    binding: CommunicationIdentityBindingRecord,
  ): boolean {
    return (
      binding.state === 'active' &&
      binding.channel === input.channel &&
      binding.account_id === input.account_id &&
      binding.principal_id === input.acknowledged_by_principal_id
    );
  }

  private hasValidAcknowledgementToken(
    input: CommunicationEscalationAcknowledgementInput,
    binding: CommunicationIdentityBindingRecord,
  ): boolean {
    return input.acknowledgement_token === this.buildAcknowledgementToken(input, binding);
  }

  private buildAcknowledgementToken(
    input: CommunicationEscalationAcknowledgementInput,
    binding: CommunicationIdentityBindingRecord,
  ): string {
    return [
      'ack',
      input.channel,
      input.account_id,
      input.conversation_id,
      input.message_id,
      input.escalation_id,
      binding.binding_id,
      input.acknowledged_by_principal_id,
    ].join('|');
  }

  private selectRejectReason(
    reasonCodes: readonly CommunicationRejectReason[],
  ): CommunicationRejectReason {
    return reasonCodes[0] ?? 'policy_blocked';
  }

  private async recordWitness(
    actionRef: string,
    status: 'succeeded' | 'blocked',
    detail: Record<string, unknown>,
  ): Promise<void> {
    if (!this.options.witnessService) {
      return;
    }

    const authorization = await this.options.witnessService.appendAuthorization({
      actionCategory: 'trace-persist',
      actionRef,
      actor: 'subcortex',
      status: 'approved',
      detail,
    });
    await this.options.witnessService.appendCompletion({
      actionCategory: 'trace-persist',
      actionRef,
      authorizationRef: authorization.id,
      actor: 'subcortex',
      status,
      detail,
    });
  }
}
