import { QwenCodeProvider } from './implementation.js';
import type { ProviderFactoryModule } from '../../schemas/provider-factory.js';

export const providerFactory = {
  vendorKey: 'qwen-code',
  create(config, options) {
    return new QwenCodeProvider(config, {
      runner: options?.agentCliRunner,
      runnerOptions: options?.agentCliRunnerOptions,
    });
  },
} as const satisfies ProviderFactoryModule;
