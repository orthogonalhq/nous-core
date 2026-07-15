import { MistralProvider } from './implementation.js';
import type { ProviderFactoryModule } from '../../schemas/provider-factory.js';

export const providerFactory = {
  vendorKey: 'mistral',
  create(config, options) {
    return new MistralProvider(config, { apiKey: options?.apiKey });
  },
} as const satisfies ProviderFactoryModule;
