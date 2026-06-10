import { OllamaProvider } from './implementation.js';
import type { ProviderFactoryModule } from '../../schemas/provider-factory.js';

export const providerFactory = {
  vendorKey: 'ollama',
  create(config) {
    return new OllamaProvider(config);
  },
} as const satisfies ProviderFactoryModule;
