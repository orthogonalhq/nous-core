import {
  buildTelegramSendMessageIntent,
  type TelegramSendMessageInput,
} from '../runtime.ts';

export const runSendMessageTool = (input: TelegramSendMessageInput) =>
  buildTelegramSendMessageIntent(input);
