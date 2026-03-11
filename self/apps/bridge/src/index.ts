export {
  TelegramBotAdapter,
  type TelegramBotAdapterOptions,
} from './connectors/telegram-bot-adapter.js';
export type {
  TelegramTransport,
  TelegramTransportRequest,
  TelegramTransportResult,
  TelegramUpdate,
  TelegramMessage,
  BridgeOutboundMessage,
} from './connectors/connector-types.js';
export { BridgeRuntime, type BridgeRuntimeOptions } from './bridge-runtime.js';
