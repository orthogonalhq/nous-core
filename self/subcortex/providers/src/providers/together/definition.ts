import type { ProviderDefinitionLeaf } from '../../schemas/provider-definition.js';

/**
 * Together AI exposes an OpenAI Chat Completions-compatible API, so this leaf
 * carries only Together-specific metadata and reuses the shared
 * `ChatCompletionsProvider`. `defaultEndpoint` is the OpenAI-compatible base;
 * the shared provider appends `/v1/chat/completions`.
 * No hand-authored built-in identifier here — generated catalogs derive
 * stable ids from vendorKey.
 *
 * `/v1/models` returns a bare top-level array, not the `{ data: [...] }`
 * envelope the `openai-models` list-format parser requires, so it cannot be
 * declared as `modelListEndpoint`/`modelListFormat` (that combination would
 * silently fail to parse and fall back to a placeholder model every time).
 * It's still useful for validating that an API key works, since key-testing
 * only checks the HTTP status and never parses the body — so it's declared
 * as `healthCheckEndpoint` instead.
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
  healthCheckEndpoint: '/v1/models',
  capabilities: {
    streaming: true,
  },
  isLocal: false,
} as const satisfies ProviderDefinitionLeaf;

export { TOGETHER_PROVIDER_DEFINITION as providerDefinition };
