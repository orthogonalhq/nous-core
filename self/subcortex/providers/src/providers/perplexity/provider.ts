/**
 * Perplexity provider factory.
 *
 * Perplexity speaks the OpenAI Chat Completions protocol, so this leaf reuses
 * the shared `ChatCompletionsProvider`. The Perplexity endpoint flows in via
 * `config.endpoint` (hydrated from `defaultEndpoint`) and the API key is
 * resolved from `PERPLEXITY_API_KEY` by the runtime and passed through here.
 */
import { ChatCompletionsProvider } from '../../protocols/openai-api/provider.js';
import type { ProviderFactoryModule } from '../../schemas/provider-factory.js';

export const providerFactory = {
  vendorKey: 'perplexity',
  create(config, options) {
    return new ChatCompletionsProvider(config, { apiKey: options?.apiKey });
  },
} as const satisfies ProviderFactoryModule;
