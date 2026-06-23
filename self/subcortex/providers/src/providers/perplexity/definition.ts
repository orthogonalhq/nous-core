/**
 * Perplexity (Sonar) provider definition — certified leaf metadata.
 *
 * Perplexity exposes an OpenAI Chat Completions-compatible Cloud API, so this
 * leaf reuses the shared `chat-completions` protocol/adapter and only declares
 * vendor-specific identity, endpoint, and credential metadata. Metadata only —
 * no environment reads, network calls, or hand-authored `wellKnownProviderId`
 * (the built-in id is derived centrally from `vendorKey`).
 */
import type { ProviderDefinitionLeaf } from '../../schemas/provider-definition.js';

const DEFAULT_ENDPOINT = 'https://api.perplexity.ai';
const DEFAULT_MODEL_ID = 'sonar';

export const PERPLEXITY_PROVIDER_DEFINITION = {
  vendorKey: 'perplexity',
  displayName: 'Perplexity',
  providerType: 'text',
  providerClass: 'remote_text',
  protocol: 'chat-completions',
  adapterKey: 'chat-completions',
  defaultEndpoint: DEFAULT_ENDPOINT,
  defaultModelId: DEFAULT_MODEL_ID,
  auth: {
    envVar: 'PERPLEXITY_API_KEY',
    vaultKeyNamespace: 'perplexity',
    header: {
      name: 'Authorization',
      scheme: 'bearer',
    },
    required: true,
    purpose: 'api_key',
  },
  // Perplexity does not expose a public model-list endpoint, so dynamic model
  // discovery is intentionally not declared — the runtime falls back to
  // `defaultModelId`. Sonar models do not support native tool use.
  capabilities: {
    streaming: true,
  },
  isLocal: false,
} as const satisfies ProviderDefinitionLeaf;

export const providerDefinition = PERPLEXITY_PROVIDER_DEFINITION;
