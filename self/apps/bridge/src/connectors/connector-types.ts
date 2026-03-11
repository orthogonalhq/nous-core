export interface TelegramUser {
  id: string;
  username?: string;
}

export interface TelegramChat {
  id: string;
  type: 'private' | 'group' | 'supergroup' | 'channel';
}

export interface TelegramMessage {
  message_id: string;
  date: number;
  text?: string;
  from: TelegramUser;
  chat: TelegramChat;
  message_thread_id?: string;
}

export interface TelegramUpdate {
  update_id: string;
  message: TelegramMessage;
}

export interface TelegramTransportRequest {
  chatId: string;
  threadId?: string;
  text: string;
}

export type TelegramTransportResult =
  | {
      outcome: 'sent';
      providerMessageRef: string;
    }
  | {
      outcome: 'blocked';
      reason: 'policy_blocked' | 'unauthorized_channel';
    }
  | {
      outcome: 'retryable_failure';
      reason?: 'permanent_delivery_failure';
    }
  | {
      outcome: 'unknown_external_effect';
    };

export interface TelegramTransport {
  sendMessage(
    request: TelegramTransportRequest,
  ): Promise<TelegramTransportResult>;
}

export interface BridgeOutboundMessage {
  egress_id: string;
  recipient_binding_ref: string;
  conversation_id: string;
  thread_id?: string | null;
  payload_ref: string;
  message_class: 'response' | 'alert' | 'escalation' | 'system_notice';
}
