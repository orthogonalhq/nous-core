import { AmpProvider } from './implementation.js';
import type { ProviderFactoryModule } from '../../schemas/provider-factory.js';

export const providerFactory = {
  vendorKey: 'amp',
  create(config) {
    return new AmpProvider(config);
  },
} as const satisfies ProviderFactoryModule;
