import { OpenClawProvider } from './implementation.js';
import type { ProviderFactoryModule } from '../../schemas/provider-factory.js';

export const providerFactory = {
  vendorKey: 'openclaw',
  create(config, options) {
    return new OpenClawProvider(config, {
      runner: options?.agentCliRunner,
      runnerOptions: options?.agentCliRunnerOptions,
    });
  },
} as const satisfies ProviderFactoryModule;
