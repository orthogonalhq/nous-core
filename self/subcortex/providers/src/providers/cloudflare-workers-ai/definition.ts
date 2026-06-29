import type { ProviderDefinitionLeaf } from '../../schemas/provider-definition.js';

export const CLOUDFLARE_WORKERS_AI_DEFAULT_ENDPOINT = 'https://api.cloudflare.com/client/v4/accounts';
export const CLOUDFLARE_WORKERS_AI_DEFAULT_MODEL_ID = '@cf/meta/llama-3.1-8b-instruct';

/**
 * Cloudflare Workers AI exposes an OpenAI Chat Completions-compatible API,
 * so this leaf carries only Cloudflare-specific metadata and reuses the
 * shared `ChatCompletionsProvider`.
 */
export const CLOUDFLARE_WORKERS_AI_PROVIDER_DEFINITION = {
  vendorKey: 'cloudflare-workers-ai',
  displayName: 'Cloudflare Workers AI',
  providerType: 'text',
  providerClass: 'remote_text',
  protocol: 'chat-completions',
  adapterKey: 'chat-completions',
  defaultEndpoint: CLOUDFLARE_WORKERS_AI_DEFAULT_ENDPOINT,
  defaultModelId: CLOUDFLARE_WORKERS_AI_DEFAULT_MODEL_ID,
  auth: {
    envVar: 'CLOUDFLARE_API_TOKEN',
    vaultKeyNamespace: 'cloudflare-workers-ai',
    header: {
      name: 'Authorization',
      scheme: 'bearer',
    },
    required: true,
    purpose: 'api_key',
  },
  capabilities: {
    streaming: true,
    modelListing: false,
  },
  isLocal: false,
} as const satisfies ProviderDefinitionLeaf;

export {
  CLOUDFLARE_WORKERS_AI_PROVIDER_DEFINITION as providerDefinition,
};
