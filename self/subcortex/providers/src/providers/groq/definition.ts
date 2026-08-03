import type { ProviderDefinitionLeaf } from '../../schemas/provider-definition.js';

export const GROQ_DEFAULT_ENDPOINT = 'https://api.groq.com/openai';
export const GROQ_DEFAULT_MODEL_ID = 'llama-3.3-70b-versatile';

/**
 * Groq exposes an OpenAI Chat Completions-compatible API, so this leaf carries
 * only Groq-specific metadata and reuses the shared `ChatCompletionsProvider`.
 * `defaultEndpoint` is the OpenAI-compatible base. 
 * The shared provider appends `/v1/chat/completions` and `/v1/models`.
 */
export const GROQ_PROVIDER_DEFINITION = {
  vendorKey: 'groq',
  displayName: 'Groq',
  providerType: 'text',
  providerClass: 'remote_text',
  protocol: 'chat-completions',
  adapterKey: 'chat-completions',
  defaultEndpoint: GROQ_DEFAULT_ENDPOINT,
  defaultModelId: GROQ_DEFAULT_MODEL_ID,
  auth: {
    envVar: 'GROQ_API_KEY',
    vaultKeyNamespace: 'groq',
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
  GROQ_PROVIDER_DEFINITION as providerDefinition,
};
