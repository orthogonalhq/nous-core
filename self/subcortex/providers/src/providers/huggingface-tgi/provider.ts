import { preprocess } from 'zod/v4';
import { ChatCompletionsProvider } from '../../protocols/openai-api/provider.js';
import type { ProviderFactoryModule } from '../../schemas/provider-factory.js';

export const providerFactory = {
  vendorKey: 'huggingface-tgi',
  create(config, options) {
    return new ChatCompletionsProvider(config, { apiKey: options?.apiKey });
  },
} as const satisfies ProviderFactoryModule;
