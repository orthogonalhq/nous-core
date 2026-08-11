import { describe, expect, it } from 'vitest';
import type { ModelProviderConfig, ProviderId, TraceId } from '@nous/shared';
import {
  ChatCompletionsProvider,
  resolveProviderDefinition,
  resolveProviderFactory,
} from '../../index.js';

const TRACE_ID = '550e8400-e29b-41d4-a716-446655440188' as TraceId;
const PROVIDER_ID = '00000000-0000-0000-0000-0000000000bb' as ProviderId;

// Gated live blackbox test. Skipped unless NOUS_ZHIPU_LIVE_BT=1 is set, so it
// never runs in normal CI and does not require a credential to be present. Run with:
//   NOUS_ZHIPU_LIVE_BT=1 ZHIPU_API_KEY=... \
//     pnpm --filter @nous/subcortex-providers exec vitest run src/__tests__/providers/zhipu.live.test.ts
const liveIt = process.env.NOUS_ZHIPU_LIVE_BT === '1' ? it : it.skip;

function liveConfig(): ModelProviderConfig {
  const definition = resolveProviderDefinition('zhipu');
  return {
    id: PROVIDER_ID,
    name: 'Zhipu GLM',
    type: 'text',
    endpoint: definition.defaultEndpoint,
    modelId: definition.defaultModelId,
    isLocal: false,
    capabilities: ['chat', 'streaming'],
    providerClass: 'remote_text',
    vendor: 'zhipu',
  };
}

function createLiveProvider(): ChatCompletionsProvider {
  const factory = resolveProviderFactory('zhipu');
  if (!factory) {
    throw new Error('zhipu provider factory is not registered');
  }
  const provider = factory.create(liveConfig(), {
    apiKey: process.env.ZHIPU_API_KEY,
  });
  if (!(provider instanceof ChatCompletionsProvider)) {
    throw new Error('expected zhipu factory to construct a ChatCompletionsProvider');
  }
  return provider;
}

describe('zhipu provider live BT', () => {
  liveIt('invokes the real Zhipu GLM chat completions API', async () => {
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
            content: 'Reply with exactly: ZHIPU_PROVIDER_CHAT_OK',
          },
        ],
      },
      traceId: TRACE_ID,
    });

    expect(response.providerId).toBe(PROVIDER_ID);
    expect(String(response.output)).toContain('ZHIPU_PROVIDER_CHAT_OK');
  }, 180_000);

  liveIt('streams a response from the real Zhipu GLM API', async () => {
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
            content: 'Reply with exactly: ZHIPU_PROVIDER_STREAM_OK',
          },
        ],
      },
      traceId: TRACE_ID,
    })) {
      streamed += chunk.content;
    }

    expect(streamed).toContain('ZHIPU_PROVIDER_STREAM_OK');
  }, 180_000);
});
