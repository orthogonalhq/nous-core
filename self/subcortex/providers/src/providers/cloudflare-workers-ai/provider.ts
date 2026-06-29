import { ChatCompletionsProvider } from '../../protocols/openai-api/provider.js';
import type { ProviderFactoryModule } from '../../schemas/provider-factory.js';

export const providerFactory = {
  vendorKey: 'cloudflare-workers-ai',
  create(config, options) {
    return new ChatCompletionsProvider(config, { apiKey: options?.apiKey });
  },
} as const satisfies ProviderFactoryModule;
