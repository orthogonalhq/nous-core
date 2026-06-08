export {
  AdapterCapabilitiesSchema,
  defineProviderAdapter,
  ProviderAdapterModuleSchema,
} from './adapter-types.js';
export type {
  AdapterCapabilities,
  AdapterFormatInput,
  AdapterFormattedRequest,
  AdapterRegistry,
  ProviderAdapter,
  ProviderAdapterCreateOptions,
  ProviderAdapterModule,
} from './adapter-types.js';

export {
  detectAndStripNarration,
  parseModelOutput,
} from './output.js';
export type { ParsedModelOutput } from './output.js';

export {
  chatCompletionsAdapter,
  createChatCompletionsAdapter,
} from './chat-completions-adapter.js';
export {
  createTextAdapter,
  textAdapter,
} from './text-adapter.js';
