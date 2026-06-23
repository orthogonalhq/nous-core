import type { ProviderDefinitionLeaf } from '../../schemas/provider-definition.js';

export const OPENROUTER_DEFAULT_ENDPOINT = 'https://openrouter.ai/api';
export const OPENROUTER_DEFAULT_MODEL_ID = 'openrouter/auto';

/**
 * OpenRouter exposes an OpenAI Chat Completions-compatible API aggregating many
 * upstream model vendors, so this leaf carries only OpenRouter-specific metadata
 * and reuses the shared `ChatCompletionsProvider`.
 * `defaultEndpoint` is the OpenAI-compatible base.
 * The shared provider appends `/v1/chat/completions` and `/v1/models`.
 */
export const OPENROUTER_PROVIDER_DEFINITION = {
  vendorKey: 'openrouter',
  displayName: 'OpenRouter',
  providerType: 'text',
  providerClass: 'remote_text',
  protocol: 'chat-completions',
  adapterKey: 'chat-completions',
  defaultEndpoint: OPENROUTER_DEFAULT_ENDPOINT,
  defaultModelId: OPENROUTER_DEFAULT_MODEL_ID,
  auth: {
    envVar: 'OPENROUTER_API_KEY',
    vaultKeyNamespace: 'openrouter',
    header: {
      name: 'Authorization',
      scheme: 'bearer',
    },
    required: true,
    purpose: 'api_key',
  },
  modelListEndpoint: '/v1/models',
  modelListFormat: 'openai-models',
  capabilities: {
    streaming: true,
    modelListing: true,
    // `nativeToolUse` is intentionally omitted: per #390 a provider must not
    // advertise it until the shared native tool-use bridge supports the full
    // request/tool-call/tool-result loop.
  },
  isLocal: false,
  // No `wellKnownProviderId`: built-in provider ids are derived centrally from
  // `vendorKey` by `provider-identity.ts` and hydrated into the catalog.
} as const satisfies ProviderDefinitionLeaf;

export {
  OPENROUTER_PROVIDER_DEFINITION as providerDefinition,
};
