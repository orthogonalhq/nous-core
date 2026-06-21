import { createHash } from 'node:crypto';
import type { ProviderId } from '@nous/shared';
import type {
  ProviderDefinition,
  ProviderDefinitionLeaf,
} from './schemas/provider-definition.js';

export const NOUS_BUILT_IN_PROVIDER_NAMESPACE =
  '8f0d7d75-f0c0-4a45-9d94-52b7d5e3d1a1';

export const LEGACY_BUILT_IN_PROVIDER_IDS = {
  anthropic: '10000000-0000-0000-0000-000000000001' as ProviderId,
  openai: '10000000-0000-0000-0000-000000000002' as ProviderId,
  ollama: '10000000-0000-0000-0000-000000000003' as ProviderId,
  'codex-cli': '10000000-0000-0000-0000-000000000004' as ProviderId,
} as const satisfies Record<string, ProviderId>;

function uuidToBytes(uuid: string): Uint8Array {
  const normalized = uuid.replace(/-/g, '');
  if (!/^[0-9a-fA-F]{32}$/.test(normalized)) {
    throw new Error(`Invalid UUID namespace '${uuid}'`);
  }

  const bytes = new Uint8Array(16);
  for (let index = 0; index < 16; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToUuid(bytes: Uint8Array): string {
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

export function deriveBuiltInProviderId(vendorKey: string): ProviderId {
  const namespaceBytes = uuidToBytes(NOUS_BUILT_IN_PROVIDER_NAMESPACE);
  const hash = createHash('sha1')
    .update(namespaceBytes)
    .update(`provider:${vendorKey}`)
    .digest();
  const bytes = new Uint8Array(hash.subarray(0, 16));

  // RFC 4122 version 5 + variant bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return bytesToUuid(bytes) as ProviderId;
}

export function hydrateProviderDefinition<const T extends ProviderDefinitionLeaf>(
  definition: T,
): T & ProviderDefinition {
  return {
    ...definition,
    wellKnownProviderId:
      definition.wellKnownProviderId ?? deriveBuiltInProviderId(definition.vendorKey),
  } as T & ProviderDefinition;
}

export function hydrateProviderDefinitions<const T extends readonly ProviderDefinitionLeaf[]>(
  definitions: T,
): { readonly [K in keyof T]: T[K] & ProviderDefinition } {
  return definitions.map(hydrateProviderDefinition) as unknown as {
    readonly [K in keyof T]: T[K] & ProviderDefinition;
  };
}

export function isKnownProviderIdForVendor(
  providerId: ProviderId,
  vendorKey: string,
): boolean {
  const legacyIds = LEGACY_BUILT_IN_PROVIDER_IDS as unknown as Record<string, ProviderId | undefined>;
  return (
    providerId === deriveBuiltInProviderId(vendorKey) ||
    providerId === legacyIds[vendorKey]
  );
}
