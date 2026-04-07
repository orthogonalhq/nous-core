/**
 * Adapter module barrel export.
 *
 * WR-127 Phase 1.2 — concrete adapter implementations and registry.
 */
export type {
  AdapterCapabilities,
  AdapterFormatInput,
  AdapterFormattedRequest,
  AdapterRegistry,
  ProviderAdapter,
} from './types.js';

export { createTextAdapter } from './text-adapter.js';
export { createOpenAiAdapter } from './openai-adapter.js';
export { createOllamaAdapter, isToolCapableModel } from './ollama-adapter.js';

import type { ProviderAdapter } from './types.js';
import { createTextAdapter } from './text-adapter.js';
import { createOpenAiAdapter } from './openai-adapter.js';
import { createOllamaAdapter } from './ollama-adapter.js';

const ADAPTER_REGISTRY: Record<string, () => ProviderAdapter> = {
  anthropic: () => {
    throw new Error(
      'resolveAdapter: Anthropic adapter not yet implemented. ' +
      'Concrete implementation arrives in SP 1.3.',
    );
  },
  openai: () => createOpenAiAdapter(),
  ollama: () => createOllamaAdapter(),
};

/**
 * Resolves a ProviderAdapter for the given provider type.
 * Unknown provider types fall back to text adapter (preserving current behavior).
 */
export function resolveAdapter(providerType: string): ProviderAdapter {
  const factory = ADAPTER_REGISTRY[providerType];
  if (factory) return factory();
  return createTextAdapter();
}
