import { randomUUID } from 'node:crypto';
import type {
  ChannelEgressEnvelope,
  ChannelIngressEnvelope,
} from '@nous/shared';
import type {
  CommunicationDeliveryProvider,
  CommunicationProviderSendResult,
} from '@nous/subcortex-communication-gateway';
import type {
  BridgeOutboundMessage,
  TelegramTransport,
  TelegramUpdate,
} from './connector-types.js';

export interface TelegramBotAdapterOptions {
  accountId: string;
  channelId?: string;
  botUsername?: string;
  authContextRef?: string;
  now?: () => string;
  idFactory?: () => string;
  transport?: TelegramTransport;
  payloadRefResolver?: (update: TelegramUpdate) => string;
}

function inferMentionState(
  update: TelegramUpdate,
  botUsername?: string,
): ChannelIngressEnvelope['mention_state'] {
  if (update.message.chat.type === 'private') {
    return 'direct';
  }
  const text = update.message.text ?? '';
  if (botUsername && text.includes(`@${botUsername}`)) {
    return 'explicit';
  }
  return 'none';
}

function inferMessageType(
  update: TelegramUpdate,
): ChannelIngressEnvelope['message_type'] {
  if (update.message.chat.type === 'private') {
    return 'dm';
  }
  if (update.message.message_thread_id) {
    return 'thread';
  }
  return 'group';
}

export class TelegramBotAdapter implements CommunicationDeliveryProvider {
  private readonly now: () => string;
  private readonly idFactory: () => string;

  constructor(private readonly options: TelegramBotAdapterOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? randomUUID;
  }

  normalizeIngress(update: TelegramUpdate): ChannelIngressEnvelope {
    return {
      ingress_id: this.idFactory(),
      channel: 'telegram',
      channel_id: this.options.channelId ?? 'telegram:bot',
      workspace_id: null,
      account_id: this.options.accountId,
      conversation_id: update.message.chat.id,
      thread_id: update.message.message_thread_id ?? null,
      message_id: update.message.message_id,
      sender_channel_identity:
        update.message.from.username != null
          ? `@${update.message.from.username}`
          : update.message.from.id,
      bound_principal_id: null,
      mention_state: inferMentionState(update, this.options.botUsername),
      message_type: inferMessageType(update),
      payload_ref:
        this.options.payloadRefResolver?.(update) ??
        (update.message.text?.trim() || `telegram:${update.message.message_id}`),
      idempotency_key: `telegram:${update.message.chat.id}:${update.message.message_id}`,
      occurred_at: new Date(update.message.date * 1000).toISOString(),
      received_at: this.now(),
      auth_context_ref: this.options.authContextRef ?? `telegram:${update.update_id}`,
      trace_parent: null,
    };
  }

  buildEgressEnvelope(message: BridgeOutboundMessage): ChannelEgressEnvelope {
    return {
      egress_id: message.egress_id,
      channel: 'telegram',
      channel_id: this.options.channelId ?? 'telegram:bot',
      workspace_id: null,
      account_id: this.options.accountId,
      conversation_id: message.conversation_id,
      thread_id: message.thread_id ?? null,
      recipient_binding_ref: message.recipient_binding_ref,
      message_class: message.message_class,
      payload_ref: message.payload_ref,
      delivery_policy_ref: 'delivery:default',
      retry_policy_ref: 'retry:1',
      requested_at: this.now(),
      trace_parent: null,
    };
  }

  async send(
    envelope: ChannelEgressEnvelope,
  ): Promise<CommunicationProviderSendResult> {
    if (!this.options.transport) {
      return {
        outcome: 'delivered',
        provider_message_ref: `telegram:${envelope.conversation_id}:${envelope.egress_id}`,
      };
    }

    const result = await this.options.transport.sendMessage({
      chatId: envelope.conversation_id,
      threadId: envelope.thread_id ?? undefined,
      text: envelope.payload_ref,
    });

    switch (result.outcome) {
      case 'sent':
        return {
          outcome: 'delivered',
          provider_message_ref: result.providerMessageRef,
        };
      case 'blocked':
        return {
          outcome: 'blocked',
          reason: result.reason,
        };
      case 'retryable_failure':
        return {
          outcome: 'failed',
          retryable: true,
          failure_class: 'retryable_transient',
          reason: result.reason,
        };
      case 'unknown_external_effect':
      default:
        return {
          outcome: 'unknown_external_effect',
        };
    }
  }
}
