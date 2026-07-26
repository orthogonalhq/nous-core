import { CohereProvider } from './implementation.js';
import type { ProviderFactoryModule } from '../../schemas/provider-factory.js';

export const providerFactory = {
  vendorKey: 'cohere',
  create(config, options) {
    return new CohereProvider(config, { apiKey: options?.apiKey });
  },
} as const satisfies ProviderFactoryModule;
