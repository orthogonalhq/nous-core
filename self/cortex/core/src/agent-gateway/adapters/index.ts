import type { ILogChannel } from '@nous/shared';
import {
  createAnthropicAdapter,
  createChatCompletionsAdapter,
  createOllamaAdapter,
  createTextAdapter,
  resolveAdapter as resolveProviderAdapter,
  resolveAdapterKeyFromConfig,
} from '@nous/subcortex-providers';
import type { ProviderAdapter } from '@nous/subcortex-providers';

export type {
  AdapterCapabilities,
  AdapterFormatInput,
  AdapterFormattedRequest,
  AdapterRegistry,
  ProviderAdapter,
  ProviderAdapterCreateOptions,
  ProviderAdapterModule,
} from '@nous/subcortex-providers';

export {
  ADAPTER_MODULES,
  ADAPTER_RESOLVER,
  buildAdapterResolver,
  createAnthropicAdapter,
  createChatCompletionsAdapter,
  createOllamaAdapter,
  createTextAdapter,
  isToolCapableModel,
  normalizeAdapterKey,
  resolveAdapterKeyFromConfig,
} from '@nous/subcortex-providers';

export function resolveAdapter(providerType: string, log?: ILogChannel): ProviderAdapter {
  return resolveProviderAdapter(providerType, { log });
}

export const resolveProviderTypeFromConfig = resolveAdapterKeyFromConfig;
