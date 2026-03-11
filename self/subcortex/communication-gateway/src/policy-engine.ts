import { randomUUID } from 'node:crypto';
import type {
  ChannelEgressEnvelope,
  ChannelIngressEnvelope,
  CommunicationIdentityBindingRecord,
  CommunicationPolicyDecision,
} from '@nous/shared';
import { CommunicationPolicyDecisionSchema } from '@nous/shared';

export interface CommunicationPolicyEngineOptions {
  authorizedAccountIds?: readonly string[];
  allowGroupConversations?: boolean;
  allowThreads?: boolean;
  requireMentionForSharedConversations?: boolean;
  now?: () => string;
  idFactory?: () => string;
}

export class CommunicationPolicyEngine {
  private readonly now: () => string;
  private readonly idFactory: () => string;

  constructor(private readonly options: CommunicationPolicyEngineOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? randomUUID;
  }

  evaluateIngress(
    envelope: ChannelIngressEnvelope,
    binding: CommunicationIdentityBindingRecord | null,
  ): CommunicationPolicyDecision {
    const connectorAuthenticated = envelope.auth_context_ref != null;
    const accountAuthorized = this.isAccountAuthorized(envelope.account_id);
    const bindingState = binding?.state ?? 'unbound';
    const mentionPolicyAllowed =
      envelope.message_type === 'dm' ||
      envelope.mention_state !== 'none' ||
      this.options.requireMentionForSharedConversations === false;
    const conversationPolicyAllowed =
      envelope.message_type !== 'group' ||
      this.options.allowGroupConversations === true;
    const threadPolicyAllowed =
      envelope.thread_id == null || this.options.allowThreads === true;

    const reasonCodes = [];
    if (!connectorAuthenticated) {
      reasonCodes.push('unauthenticated_connector' as const);
    }
    if (!accountAuthorized) {
      reasonCodes.push('unauthorized_channel' as const);
    }
    if (bindingState !== 'active') {
      reasonCodes.push('identity_unbound' as const);
    }
    if (!mentionPolicyAllowed) {
      reasonCodes.push('mention_required' as const);
    }
    if (!conversationPolicyAllowed) {
      reasonCodes.push('conversation_not_allowed' as const);
    }
    if (!threadPolicyAllowed) {
      reasonCodes.push('thread_not_allowed' as const);
    }

    return CommunicationPolicyDecisionSchema.parse({
      decision_id: this.idFactory(),
      ingress_id: envelope.ingress_id,
      connector_authenticated: connectorAuthenticated,
      account_authorized: accountAuthorized,
      binding_state: bindingState,
      mention_policy_allowed: mentionPolicyAllowed,
      conversation_policy_allowed: conversationPolicyAllowed,
      thread_policy_allowed: threadPolicyAllowed,
      reason_codes: reasonCodes,
      evidence_refs: [`policy:${envelope.ingress_id}`],
      evaluated_at: this.now(),
    });
  }

  evaluateEgress(
    envelope: ChannelEgressEnvelope,
    binding: CommunicationIdentityBindingRecord | null,
  ): CommunicationPolicyDecision {
    const accountAuthorized = this.isAccountAuthorized(envelope.account_id);
    const bindingState = binding?.state ?? 'unbound';
    const reasonCodes = [];

    if (!accountAuthorized) {
      reasonCodes.push('unauthorized_channel' as const);
    }
    if (binding == null) {
      reasonCodes.push('unknown_account_binding' as const);
    } else if (bindingState !== 'active') {
      reasonCodes.push('identity_unbound' as const);
    }

    return CommunicationPolicyDecisionSchema.parse({
      decision_id: this.idFactory(),
      egress_id: envelope.egress_id,
      connector_authenticated: true,
      account_authorized: accountAuthorized,
      binding_state: bindingState,
      mention_policy_allowed: true,
      conversation_policy_allowed: true,
      thread_policy_allowed: true,
      reason_codes: reasonCodes,
      evidence_refs: [`policy:${envelope.egress_id}`],
      evaluated_at: this.now(),
    });
  }

  isIngressAllowed(decision: CommunicationPolicyDecision): boolean {
    return (
      decision.connector_authenticated &&
      decision.account_authorized &&
      decision.binding_state === 'active' &&
      decision.mention_policy_allowed &&
      decision.conversation_policy_allowed &&
      decision.thread_policy_allowed
    );
  }

  isApprovalIntakeEligible(decision: CommunicationPolicyDecision): boolean {
    return (
      decision.connector_authenticated &&
      decision.account_authorized &&
      decision.binding_state !== 'active'
    );
  }

  isEgressAllowed(decision: CommunicationPolicyDecision): boolean {
    return (
      decision.connector_authenticated &&
      decision.account_authorized &&
      decision.binding_state === 'active'
    );
  }

  private isAccountAuthorized(accountId: string): boolean {
    return this.options.authorizedAccountIds == null ||
      this.options.authorizedAccountIds.length === 0
      ? true
      : this.options.authorizedAccountIds.includes(accountId);
  }
}
