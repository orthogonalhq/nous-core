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

import type { ILogChannel } from '@nous/shared';
import type { ProviderAdapter } from './types.js';
import { createTextAdapter } from './text-adapter.js';
import { createOpenAiAdapter } from './openai-adapter.js';
import { createAnthropicAdapter } from './anthropic-adapter.js';
import { createOllamaAdapter } from './ollama-adapter.js';

/**
 * Resolves a ProviderAdapter for the given provider type.
 * Unknown provider types fall back to text adapter (preserving current behavior).
 * When a log channel is provided, it is forwarded to the adapter factory.
 */
export function resolveAdapter(providerType: string, log?: ILogChannel): ProviderAdapter {
  switch (providerType) {
    case 'anthropic': return createAnthropicAdapter(log);
    case 'openai': return createOpenAiAdapter();
    case 'ollama': return createOllamaAdapter(undefined, log);
    default: return createTextAdapter(log);
  }
}

/**
 * Detects provider type from an IModelProvider's config name/type.
 * Uses the same heuristic as CortexRuntime.resolveProviderType.
 * Falls back to 'text' for unknown providers.
 */
export function resolveProviderTypeFromConfig(provider: { getConfig(): { name?: string; type?: string; vendor?: string } }): string {
  try {
    const config = provider.getConfig();
    // Vendor-first: canonical resolution per provider-vendor-field-v1.md
    const vendor = config.vendor;
    if (vendor === 'anthropic' || vendor === 'openai' || vendor === 'ollama') {
      return vendor;
    }
    // Fallback: name/type heuristic per non-harness-fallback-v1.md
    const name = (config.name ?? config.type ?? '').toLowerCase();
    if (name.includes('anthropic') || name.includes('claude')) return 'anthropic';
    if (name.includes('openai') || name.includes('gpt')) return 'openai';
    if (name.includes('ollama')) return 'ollama';
    return 'text';
  } catch {
    return 'text';
  }
}
