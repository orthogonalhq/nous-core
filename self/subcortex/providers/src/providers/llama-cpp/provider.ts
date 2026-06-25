import { ChatCompletionsProvider } from '../../protocols/openai-api/provider.js';
import type { ProviderFactoryCreateOptions, ProviderFactoryModule } from '../../schemas/provider-factory.js';
import type { ModelProviderConfig } from '@nous/shared';

export const providerFactory = {
  vendorKey: 'llama-cpp',
  create(config: ModelProviderConfig, options?: ProviderFactoryCreateOptions) {
    return new ChatCompletionsProvider(config, {
      apiKey: options?.apiKey ?? 'no-auth',
    });
  },
} as const satisfies ProviderFactoryModule;
