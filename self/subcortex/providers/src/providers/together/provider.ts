import { NousError } from '@nous/shared';
import { ChatCompletionsProvider } from '../../protocols/openai-api/provider.js';
import type { ProviderFactoryModule } from '../../schemas/provider-factory.js';

export const providerFactory = {
  vendorKey: 'together',
  create(config, options) {
    const apiKey = options?.apiKey ?? process.env.TOGETHER_API_KEY;
    if (!apiKey) {
      throw new NousError(
        'Together AI API key required — set TOGETHER_API_KEY or pass the apiKey option',
        'PROVIDER_AUTH_FAILED',
        { failoverReasonCode: 'PRV-AUTH-FAILURE' },
      );
    }
    return new ChatCompletionsProvider(config, { apiKey });
  },
} as const satisfies ProviderFactoryModule;
