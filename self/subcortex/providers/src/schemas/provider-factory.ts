import type {
  IModelProvider,
  ModelProviderConfig,
  ProviderVendor,
} from '@nous/shared';
import type {
  AgentCliRunner,
  AgentCliRunnerOptions,
} from '../protocols/agent-cli/runner.js';

export interface ProviderFactoryCreateOptions {
  apiKey?: string;
  agentCliRunner?: AgentCliRunner;
  agentCliRunnerOptions?: AgentCliRunnerOptions;
}

export interface ProviderFactoryModule {
  readonly vendorKey: ProviderVendor;
  create(
    config: ModelProviderConfig,
    options?: ProviderFactoryCreateOptions,
  ): IModelProvider;
}
