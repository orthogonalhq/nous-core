import { CodexCliProvider } from './implementation.js';
import type { ProviderFactoryModule } from '../../schemas/provider-factory.js';

export const providerFactory = {
  vendorKey: 'codex-cli',
  create(config, options) {
    return new CodexCliProvider(config, {
      runner: options?.agentCliRunner,
      runnerOptions: options?.agentCliRunnerOptions,
    });
  },
} as const satisfies ProviderFactoryModule;
