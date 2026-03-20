export interface TelegramSendMessageRequest {
  chatId: string;
  text: string;
  threadId?: string;
}

export interface TelegramSendMessageResponse {
  outcome: 'sent' | 'blocked';
  providerMessageRef?: string;
  reason?: string;
}

export const buildTelegramSendMessageRequest = (
  input: TelegramSendMessageRequest,
): TelegramSendMessageRequest => ({
  chatId: input.chatId,
  text: input.text,
  threadId: input.threadId,
});

export const createTelegramResponseSummary = (
  response: TelegramSendMessageResponse,
) => ({
  outcome: response.outcome,
  provider_message_ref: response.providerMessageRef ?? null,
  reason: response.reason ?? null,
});
