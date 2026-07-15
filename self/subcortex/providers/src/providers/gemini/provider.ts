import { GeminiProvider } from './implementation.js';
import type { ProviderFactoryModule } from '../../schemas/provider-factory.js';

export const providerFactory = {
  vendorKey: 'gemini',
  create(config, options) {
    return new GeminiProvider(config, { apiKey: options?.apiKey });
  },
} as const satisfies ProviderFactoryModule;
