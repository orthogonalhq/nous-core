import { NousError } from '@nous/shared';
import { ChatCompletionsProvider } from '../../protocols/openai-api/provider.js';
import type { ProviderFactoryModule } from '../../schemas/provider-factory.js';
import { DASHSCOPE_PROVIDER_DEFINITION } from './definition.js';

const DASHSCOPE_ENV_VAR = DASHSCOPE_PROVIDER_DEFINITION.auth.envVar!;

export const providerFactory = {
  vendorKey: 'dashscope',
  create(config, options) {
    const apiKey = options?.apiKey ?? process.env[DASHSCOPE_ENV_VAR];
    if (!apiKey) {
      throw new NousError(
        'DashScope API key required — set DASHSCOPE_API_KEY or pass apiKey option',
        'PROVIDER_AUTH_FAILED',
        { failoverReasonCode: 'PRV-AUTH-FAILURE' },
      );
    }
    return new ChatCompletionsProvider(config, { apiKey });
  },
} as const satisfies ProviderFactoryModule;
