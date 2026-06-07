import { ANTHROPIC_PROVIDER_DEFINITION } from './anthropic.js';
import { CHAT_COMPLETIONS_PROVIDER_DEFINITION } from './chat-completions.js';
import { OLLAMA_PROVIDER_DEFINITION } from './ollama.js';
import type { ProviderDefinition } from './types.js';

export { ANTHROPIC_PROVIDER_DEFINITION } from './anthropic.js';
export { CHAT_COMPLETIONS_PROVIDER_DEFINITION } from './chat-completions.js';
export { OLLAMA_PROVIDER_DEFINITION } from './ollama.js';
export {
  defineProvider,
  ProviderAdapterKeySchema,
  ProviderAuthDefinitionSchema,
  ProviderCapabilityDefinitionSchema,
  ProviderCredentialPurposeSchema,
  ProviderDefinitionSchema,
  ProviderProtocolSchema,
} from './types.js';
export type {
  ProviderAdapterKey,
  ProviderAuthDefinition,
  ProviderCapabilityDefinition,
  ProviderCredentialPurpose,
  ProviderDefinition,
  ProviderProtocol,
} from './types.js';

export const PROVIDER_DEFINITIONS = [
  ANTHROPIC_PROVIDER_DEFINITION,
  CHAT_COMPLETIONS_PROVIDER_DEFINITION,
  OLLAMA_PROVIDER_DEFINITION,
] as const satisfies readonly ProviderDefinition[];

export type ProviderVendorKey = (typeof PROVIDER_DEFINITIONS)[number]['vendorKey'];
export type BootstrapProviderKey = ProviderVendorKey;
