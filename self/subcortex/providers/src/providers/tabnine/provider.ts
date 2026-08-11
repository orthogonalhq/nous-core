import { TabnineProvider } from './implementation.js';
import type { ProviderFactoryModule } from '../../schemas/provider-factory.js';

export const providerFactory = {
  vendorKey: 'tabnine',
  create(config, options) {
    return new TabnineProvider(config, {
      runner: options?.agentCliRunner,
      runnerOptions: options?.agentCliRunnerOptions,
    });
  },
} as const satisfies ProviderFactoryModule;
