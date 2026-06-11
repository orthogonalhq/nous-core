import { AnthropicProvider } from './implementation.js';
import type { ProviderFactoryModule } from '../../schemas/provider-factory.js';

export const providerFactory = {
  vendorKey: 'anthropic',
  create(config, options) {
    return new AnthropicProvider(config, { apiKey: options?.apiKey });
  },
} as const satisfies ProviderFactoryModule;
