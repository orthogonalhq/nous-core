/**
 * Adapter module barrel export.
 *
 * WR-127 Phase 1.1 — types and registry signature only.
 * Concrete adapter implementations are SP 1.3 scope.
 */
export type {
  AdapterCapabilities,
  AdapterFormatInput,
  AdapterFormattedRequest,
  AdapterRegistry,
  ProviderAdapter,
} from './types.js';

/**
 * Resolves a ProviderAdapter for the given provider type.
 *
 * SP 1.1: signature-only export. Throws until SP 1.3 registers concrete adapters.
 * Unknown provider types will fall back to textAdapter (preserving current behavior).
 *
 * @param providerType - Provider type string from ModelProviderConfig.type
 * @returns The resolved ProviderAdapter
 */
export function resolveAdapter(providerType: string): never {
  throw new Error(
    `resolveAdapter: no adapters registered (SP 1.1 types-only). ` +
    `Requested provider type: "${providerType}". ` +
    `Concrete adapters will be registered in SP 1.3.`,
  );
}
