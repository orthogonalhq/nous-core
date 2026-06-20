import { describe, expect, it } from 'vitest';
import type { ModelProviderConfig, ProviderId, TraceId } from '@nous/shared';
import {
  ChatCompletionsProvider,
  resolveProviderDefinition,
  resolveProviderFactory,
} from '../../index.js';

const TRACE_ID = '550e8400-e29b-41d4-a716-446655440199' as TraceId;
const PROVIDER_ID = '00000000-0000-0000-0000-0000000000ab' as ProviderId;

// Gated live blackbox test. Skipped unless NOUS_MOONSHOT_LIVE_BT=1 is set, so it
// never runs in normal CI and does not require a credential to be present. Run with:
//   NOUS_MOONSHOT_LIVE_BT=1 MOONSHOT_API_KEY=sk-... \
//     pnpm --filter @nous/subcortex-providers exec vitest run src/__tests__/providers/moonshot.live.test.ts
const liveIt = process.env.NOUS_MOONSHOT_LIVE_BT === '1' ? it : it.skip;

function liveConfig(): ModelProviderConfig {
  const definition = resolveProviderDefinition('moonshot');
  return {
    id: PROVIDER_ID,
    name: 'Moonshot Kimi',
    type: 'text',
    endpoint: definition.defaultEndpoint,
    modelId: definition.defaultModelId,
    isLocal: false,
    capabilities: ['chat', 'streaming'],
    providerClass: 'remote_text',
    vendor: 'moonshot',
  };
}

function createLiveProvider(): ChatCompletionsProvider {
  const factory = resolveProviderFactory('moonshot');
  if (!factory) {
    throw new Error('moonshot provider factory is not registered');
  }
  const provider = factory.create(liveConfig(), {
    apiKey: process.env.MOONSHOT_API_KEY,
  });
  if (!(provider instanceof ChatCompletionsProvider)) {
    throw new Error('expected moonshot factory to construct a ChatCompletionsProvider');
  }
  return provider;
}

describe('moonshot provider live BT', () => {
  liveIt('invokes the real Moonshot Kimi chat completions API', async () => {
    const provider = createLiveProvider();

    const response = await provider.invoke({
      role: 'workers',
      input: {
        messages: [
          {
            role: 'system',
            content: 'You are a live provider smoke test. Reply with exactly the requested token and nothing else.',
          },
          {
            role: 'user',
            content: 'Reply with exactly: MOONSHOT_PROVIDER_CHAT_OK',
          },
        ],
      },
      traceId: TRACE_ID,
    });

    expect(response.providerId).toBe(PROVIDER_ID);
    expect(String(response.output)).toContain('MOONSHOT_PROVIDER_CHAT_OK');
  }, 180_000);

  liveIt('streams a response from the real Moonshot Kimi API', async () => {
    const provider = createLiveProvider();

    let streamed = '';
    for await (const chunk of provider.stream({
      role: 'workers',
      input: {
        messages: [
          {
            role: 'system',
            content: 'You are a live provider streaming smoke test. Reply with exactly the requested token and nothing else.',
          },
          {
            role: 'user',
            content: 'Reply with exactly: MOONSHOT_PROVIDER_STREAM_OK',
          },
        ],
      },
      traceId: TRACE_ID,
    })) {
      streamed += chunk.content;
    }

    expect(streamed).toContain('MOONSHOT_PROVIDER_STREAM_OK');
  }, 180_000);
});
