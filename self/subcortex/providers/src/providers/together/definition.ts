import type { ProviderDefinitionLeaf } from '../../schemas/provider-definition.js';

/**
 * Together AI exposes an OpenAI Chat Completions-compatible API, so this leaf
 * carries only Together-specific metadata and reuses the shared
 * `ChatCompletionsProvider`. `defaultEndpoint` is the OpenAI-compatible base;
 * the shared provider appends `/v1/chat/completions` and `/v1/models`.
 * No hand-authored built-in identifier here — generated catalogs derive
 * stable ids from vendorKey.
 */
export const TOGETHER_PROVIDER_DEFINITION = {
  vendorKey: 'together',
  displayName: 'Together AI',
  providerType: 'text',
  providerClass: 'remote_text',
  protocol: 'chat-completions',
  adapterKey: 'chat-completions',
  defaultEndpoint: 'https://api.together.ai',
  defaultModelId: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  auth: {
    envVar: 'TOGETHER_API_KEY',
    vaultKeyNamespace: 'together',
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
  },
  isLocal: false,
} as const satisfies ProviderDefinitionLeaf;

export { TOGETHER_PROVIDER_DEFINITION as providerDefinition };
