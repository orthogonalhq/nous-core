/**
 * @nous/subcortex-providers — Model provider adapters for Nous-OSS.
 */
export { AnthropicProvider } from './providers/anthropic/implementation.js';
export * from './adapter-resolver.js';
export * from './provider-adapters.js';
export * from './provider-definitions.js';
export * from './provider-factories.js';
export {
  AdapterCapabilitiesSchema,
  defineProviderAdapter,
  ProviderAdapterModuleSchema,
} from './schemas/provider-adapter.js';
export type {
  AdapterCapabilities,
  AdapterFormatInput,
  AdapterFormattedRequest,
  AdapterRegistry,
  ProviderAdapter,
  ProviderAdapterCreateOptions,
  ProviderAdapterModule,
} from './schemas/provider-adapter.js';
export {
  detectAndStripNarration,
  parseModelOutput,
} from './shared/output.js';
export type { ParsedModelOutput } from './shared/output.js';
export {
  chatCompletionsAdapter,
  createChatCompletionsAdapter,
} from './protocols/openai-api/adapter.js';
export {
  createTextAdapter,
  textAdapter,
} from './shared/text-adapter.js';
export { OllamaProvider } from './providers/ollama/implementation.js';
export { ChatCompletionsProvider } from './protocols/openai-api/provider.js';
export { ProviderRegistry } from './runtime/provider-runtime.js';
export type { ProviderRegistryOptions } from './runtime/provider-runtime.js';
export {
  InferenceLane,
  InferenceLaneRegistry,
  LaneAwareProvider,
  LeaseHeldError,
  ObservableProvider,
  TokenAccumulatorService,
} from '@nous/subcortex-inference-runtime';
export type {
  InferenceLaneAnalytics,
  InferenceLaneLeaseState,
  InferencePriority,
  LaneLeaseReleasedEvent,
  LaneWaitEstimate,
  ObservableProviderMeta,
  ProviderBreakdownEntry,
  WindowSummary,
} from '@nous/subcortex-inference-runtime';
export { TextModelInputSchema } from './schemas/text-model-input.js';
export type { TextModelInput } from './schemas/text-model-input.js';
