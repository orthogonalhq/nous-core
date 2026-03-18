import {
  buildTelegramConnectorStatus,
  type TelegramConnectorStatusInput,
} from '../runtime.ts';

export const runConnectorStatusTool = (input: TelegramConnectorStatusInput) =>
  buildTelegramConnectorStatus(input);
