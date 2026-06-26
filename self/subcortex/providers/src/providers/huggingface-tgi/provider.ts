import { ChatCompletionsProvider } from '../../protocols/openai-api/provider.js';
import type { ProviderFactoryModule } from '../../schemas/provider-factory.js';

export const providerFactory = {
  vendorKey: 'huggingface-tgi',
  create(config, options) {
    const apiKey = options?.apiKey ?? process.env.HUGGINGFACE_API_KEY ?? '';

    return new ChatCompletionsProvider(config, {
      apiKey,
    });
  },
} as const satisfies ProviderFactoryModule;
