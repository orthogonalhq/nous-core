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
export { createAnthropicAdapter } from './anthropic-adapter.js';
export { createOllamaAdapter, isToolCapableModel } from './ollama-adapter.js';

import type { ProviderAdapter } from './types.js';
import { createTextAdapter } from './text-adapter.js';
import { createOpenAiAdapter } from './openai-adapter.js';
import { createAnthropicAdapter } from './anthropic-adapter.js';
import { createOllamaAdapter } from './ollama-adapter.js';

const ADAPTER_REGISTRY: Record<string, () => ProviderAdapter> = {
  anthropic: () => createAnthropicAdapter(),
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

/**
 * Detects provider type from an IModelProvider's config name/type.
 * Uses the same heuristic as CortexRuntime.resolveProviderType.
 * Falls back to 'text' for unknown providers.
 */
export function resolveProviderTypeFromConfig(provider: { getConfig(): { name?: string; type?: string } }): string {
  try {
    const config = provider.getConfig();
    const name = (config.name ?? config.type ?? '').toLowerCase();
    if (name.includes('anthropic') || name.includes('claude')) return 'anthropic';
    if (name.includes('openai') || name.includes('gpt')) return 'openai';
    if (name.includes('ollama')) return 'ollama';
    return 'text';
  } catch {
    return 'text';
  }
}
