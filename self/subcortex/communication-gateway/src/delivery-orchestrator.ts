import { randomUUID } from 'node:crypto';
import type {
  ChannelEgressEnvelope,
  CommunicationDeliveryAttempt,
  CommunicationIdentityBindingRecord,
  CommunicationRejectReason,
  CommunicationRouteDecision,
  RecoveryFailureClass,
} from '@nous/shared';
import { CommunicationDeliveryAttemptSchema } from '@nous/shared';
import { BindingStore } from './binding-store.js';
import { DocumentCommunicationStore } from './document-communication-store.js';
import { DeliveryDedupeStore } from './delivery-dedupe-store.js';

export type CommunicationProviderSendResult =
  | {
      outcome: 'delivered';
      provider_message_ref?: string;
    }
  | {
      outcome: 'blocked';
      reason: CommunicationRejectReason;
    }
  | {
      outcome: 'failed';
      retryable: boolean;
      failure_class?: RecoveryFailureClass;
      reason?: CommunicationRejectReason;
      suggested_failover_binding_ref?: string;
    }
  | {
      outcome: 'unknown_external_effect';
      suggested_failover_binding_ref?: string;
    };

export interface CommunicationDeliveryProvider {
  send(envelope: ChannelEgressEnvelope): Promise<CommunicationProviderSendResult>;
}

export interface DeliveryOrchestratorOptions {
  store: DocumentCommunicationStore;
  bindingStore: BindingStore;
  provider: CommunicationDeliveryProvider;
  now?: () => string;
  idFactory?: () => string;
  defaultRetryBudget?: number;
}

export class DeliveryOrchestrator {
  private readonly dedupeStore: DeliveryDedupeStore;
  private readonly now: () => string;
  private readonly idFactory: () => string;
  private readonly defaultRetryBudget: number;

  constructor(private readonly options: DeliveryOrchestratorOptions) {
    this.dedupeStore = new DeliveryDedupeStore(options.store);
    this.now = options.now ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? randomUUID;
    this.defaultRetryBudget = options.defaultRetryBudget ?? 1;
  }

  async dispatch(
    envelope: ChannelEgressEnvelope,
    route: CommunicationRouteDecision,
    binding: CommunicationIdentityBindingRecord,
  ): Promise<CommunicationDeliveryAttempt> {
    const existing = await this.dedupeStore.getByEgressId(envelope.egress_id);
    if (existing) {
      return CommunicationDeliveryAttemptSchema.parse({
        ...existing,
        delivery_attempt_id: this.idFactory(),
        outcome: 'deduplicated',
        occurred_at: this.now(),
      });
    }

    return this.performSend(
      envelope,
      route,
      binding,
      this.parseRetryBudget(envelope.retry_policy_ref),
    );
  }

  private parseRetryBudget(retryPolicyRef: string): number {
    const match = retryPolicyRef.match(/(\d+)/);
    return match ? Number(match[1]) : this.defaultRetryBudget;
  }

  private async performSend(
    envelope: ChannelEgressEnvelope,
    route: CommunicationRouteDecision,
    binding: CommunicationIdentityBindingRecord,
    retryBudgetRemaining: number,
  ): Promise<CommunicationDeliveryAttempt> {
    const result = await this.options.provider.send(envelope);

    if (result.outcome === 'delivered') {
      return this.saveAttempt({
        route_id: route.route_id,
        egress_id: envelope.egress_id,
        outcome: 'delivered',
        retry_budget_remaining: retryBudgetRemaining,
        provider_message_ref: result.provider_message_ref,
        reason_codes: [],
      });
    }

    if (result.outcome === 'blocked') {
      return this.saveAttempt({
        route_id: route.route_id,
        egress_id: envelope.egress_id,
        outcome: 'delivery_blocked',
        retry_budget_remaining: retryBudgetRemaining,
        reason_codes: [result.reason],
      });
    }

    if (result.outcome === 'unknown_external_effect') {
      return this.saveAttempt({
        route_id: route.route_id,
        egress_id: envelope.egress_id,
        outcome: 'review_required',
        failure_class: 'unknown_external_effect',
        retry_budget_remaining: retryBudgetRemaining,
        failover_target_binding_ref: result.suggested_failover_binding_ref,
        reason_codes: ['unknown_external_effect'],
      });
    }

    const failoverResult = await this.tryFailover(
      result.suggested_failover_binding_ref,
      binding,
      envelope,
      route,
      retryBudgetRemaining,
    );
    if (failoverResult) {
      return failoverResult;
    }

    if (result.retryable && retryBudgetRemaining > 0) {
      return this.performSend(envelope, route, binding, retryBudgetRemaining - 1);
    }

    return this.saveAttempt({
      route_id: route.route_id,
      egress_id: envelope.egress_id,
      outcome: 'delivery_failed',
      failure_class:
        result.failure_class ?? (result.retryable
          ? 'retryable_transient'
          : 'non_retryable_deterministic'),
      retry_budget_remaining: retryBudgetRemaining,
      reason_codes: [result.reason ?? 'permanent_delivery_failure'],
    });
  }

  private async tryFailover(
    targetBindingRef: string | undefined,
    sourceBinding: CommunicationIdentityBindingRecord,
    envelope: ChannelEgressEnvelope,
    route: CommunicationRouteDecision,
    retryBudgetRemaining: number,
  ): Promise<CommunicationDeliveryAttempt | null> {
    if (!targetBindingRef) {
      return null;
    }

    const targetBinding = await this.options.bindingStore.get(targetBindingRef);
    if (
      !targetBinding ||
      targetBinding.state !== 'active' ||
      !targetBinding.failover_group_ref ||
      targetBinding.failover_group_ref !== sourceBinding.failover_group_ref
    ) {
      return this.saveAttempt({
        route_id: route.route_id,
        egress_id: envelope.egress_id,
        outcome: 'delivery_blocked',
        retry_budget_remaining: retryBudgetRemaining,
        failover_target_binding_ref: targetBindingRef,
        reason_codes: ['policy_blocked'],
      });
    }

    const failoverEnvelope = {
      ...envelope,
      recipient_binding_ref: targetBinding.binding_id,
    };
    const result = await this.options.provider.send(failoverEnvelope);

    if (result.outcome === 'delivered') {
      return this.saveAttempt({
        route_id: route.route_id,
        egress_id: envelope.egress_id,
        outcome: 'delivered',
        retry_budget_remaining: retryBudgetRemaining,
        provider_message_ref: result.provider_message_ref,
        failover_target_binding_ref: targetBinding.binding_id,
        reason_codes: [],
      });
    }

    if (result.outcome === 'unknown_external_effect') {
      return this.saveAttempt({
        route_id: route.route_id,
        egress_id: envelope.egress_id,
        outcome: 'review_required',
        failure_class: 'unknown_external_effect',
        retry_budget_remaining: retryBudgetRemaining,
        failover_target_binding_ref: targetBinding.binding_id,
        reason_codes: ['unknown_external_effect'],
      });
    }

    if (result.outcome === 'blocked') {
      return this.saveAttempt({
        route_id: route.route_id,
        egress_id: envelope.egress_id,
        outcome: 'delivery_blocked',
        retry_budget_remaining: retryBudgetRemaining,
        failover_target_binding_ref: targetBinding.binding_id,
        reason_codes: [result.reason],
      });
    }

    return this.saveAttempt({
      route_id: route.route_id,
      egress_id: envelope.egress_id,
      outcome: 'delivery_failed',
      failure_class: result.failure_class ?? 'non_retryable_deterministic',
      retry_budget_remaining: retryBudgetRemaining,
      failover_target_binding_ref: targetBinding.binding_id,
      reason_codes: [result.reason ?? 'permanent_delivery_failure'],
    });
  }

  private async saveAttempt(input: {
    route_id: string;
    egress_id: string;
    outcome: CommunicationDeliveryAttempt['outcome'];
    retry_budget_remaining: number;
    provider_message_ref?: string;
    failover_target_binding_ref?: string;
    reason_codes: CommunicationDeliveryAttempt['reason_codes'];
    failure_class?: CommunicationDeliveryAttempt['failure_class'];
  }): Promise<CommunicationDeliveryAttempt> {
    return this.options.store.saveDeliveryAttempt(
      CommunicationDeliveryAttemptSchema.parse({
        delivery_attempt_id: this.idFactory(),
        route_id: input.route_id,
        egress_id: input.egress_id,
        outcome: input.outcome,
        failure_class: input.failure_class,
        retry_budget_remaining: input.retry_budget_remaining,
        provider_message_ref: input.provider_message_ref,
        failover_target_binding_ref: input.failover_target_binding_ref,
        reason_codes: input.reason_codes,
        evidence_refs: [`delivery:${input.egress_id}`],
        occurred_at: this.now(),
      }),
    );
  }
}
