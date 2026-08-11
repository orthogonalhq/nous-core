import { NousError } from '@nous/shared';
import { ChatCompletionsProvider } from '../../protocols/openai-api/provider.js';
import type { ProviderFactoryModule } from '../../schemas/provider-factory.js';

export const providerFactory = {
  vendorKey: 'zhipu',
  create(config, options?) {
    // Fail closed: ChatCompletionsProvider falls back to OPENAI_API_KEY when no
    // key is passed, which could leak an OpenAI credential to Zhipu. Resolve the
    // Zhipu key explicitly and refuse to construct without it.
    const apiKey = options?.apiKey ?? process.env.ZHIPU_API_KEY;
    if (!apiKey) {
      throw new NousError(
        'Zhipu API key required — set ZHIPU_API_KEY or pass the apiKey option',
        'PROVIDER_AUTH_FAILED',
        { failoverReasonCode: 'PRV-AUTH-FAILURE' },
      );
    }
    // Zhipu's paas/v4 base already includes the version, so its completions
    // route is `/chat/completions` (no `/v1`), unlike OpenAI's default.
    return new ChatCompletionsProvider(config, {
      apiKey,
      completionsPath: '/chat/completions',
    });
  },
} as const satisfies ProviderFactoryModule;
