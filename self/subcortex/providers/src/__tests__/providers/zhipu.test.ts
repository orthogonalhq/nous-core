import { describe, expect, it } from 'vitest';
import type { ModelProviderConfig, ProviderId, TraceId } from '@nous/shared';
import {
  ADAPTER_RESOLVER,
  ChatCompletionsProvider,
  PROVIDER_DEFINITIONS,
  ProviderDefinitionSchema,
  deriveBuiltInProviderId,
  resolveProviderDefinition,
  resolveProviderFactory,
} from '../../index.js';
import {
  providerAdapter,
  providerDefinition,
  providerFactory,
} from '../../providers/zhipu/index.js';
import { ZHIPU_PROVIDER_DEFINITION } from '../../providers/zhipu/definition.js';

const TRACE_ID = '550e8400-e29b-41d4-a716-446655440177' as TraceId;
const PROVIDER_ID = '00000000-0000-0000-0000-0000000000bb' as ProviderId;

function zhipuConfig(): ModelProviderConfig {
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

describe('zhipu provider leaf — definition', () => {
  it('exposes the leaf definition under the canonical alias', () => {
    expect(providerDefinition).toBe(ZHIPU_PROVIDER_DEFINITION);
  });

  it('does not hand-author a built-in provider id', () => {
    expect('wellKnownProviderId' in ZHIPU_PROVIDER_DEFINITION).toBe(false);
  });

  it('declares Zhipu GLM identity, protocol, and credential metadata', () => {
    expect(ZHIPU_PROVIDER_DEFINITION.vendorKey).toBe('zhipu');
    expect(ZHIPU_PROVIDER_DEFINITION.protocol).toBe('chat-completions');
    expect(ZHIPU_PROVIDER_DEFINITION.adapterKey).toBe('chat-completions');
    expect(ZHIPU_PROVIDER_DEFINITION.defaultEndpoint).toBe('https://api.z.ai/api/paas/v4');
    expect(ZHIPU_PROVIDER_DEFINITION.defaultModelId).toBe('glm-4.6');
    expect(ZHIPU_PROVIDER_DEFINITION.isLocal).toBe(false);
    expect(ZHIPU_PROVIDER_DEFINITION.auth).toEqual({
      envVar: 'ZHIPU_API_KEY',
      vaultKeyNamespace: 'zhipu',
      header: {
        name: 'Authorization',
        scheme: 'bearer',
      },
      required: true,
      purpose: 'api_key',
    });
  });

  it('does not declare a model-list endpoint (falls back to the default model)', () => {
    expect('modelListEndpoint' in ZHIPU_PROVIDER_DEFINITION).toBe(false);
    expect('modelListFormat' in ZHIPU_PROVIDER_DEFINITION).toBe(false);
  });

  it('is hydrated into PROVIDER_DEFINITIONS with a derived built-in id', () => {
    const hydrated = resolveProviderDefinition('zhipu');
    expect(PROVIDER_DEFINITIONS).toContainEqual(hydrated);
    expect(hydrated.wellKnownProviderId).toBe(deriveBuiltInProviderId('zhipu'));
  });

  it('validates through ProviderDefinitionSchema after hydration', () => {
    const hydrated = resolveProviderDefinition('zhipu');
    expect(ProviderDefinitionSchema.parse(hydrated)).toEqual(hydrated);
  });
});

describe('zhipu provider leaf — adapter (GLM chat completions shape)', () => {
  it('reuses the shared chat-completions adapter', () => {
    expect(providerAdapter).toBe(ADAPTER_RESOLVER.resolveModule('chat-completions'));
  });

  it('parses a GLM text response', () => {
    const adapter = ADAPTER_RESOLVER.resolveAdapter(ZHIPU_PROVIDER_DEFINITION.adapterKey);
    const parsed = adapter.parseResponse(
      {
        id: 'chatcmpl-glm',
        model: 'glm-4.6',
        choices: [{ message: { role: 'assistant', content: 'Hello from GLM' } }],
        usage: { prompt_tokens: 12, completion_tokens: 4 },
      },
      TRACE_ID,
    );

    expect(parsed.response).toBe('Hello from GLM');
    expect(parsed.toolCalls).toEqual([]);
    expect(parsed.contentType).toBe('text');
  });

  it('parses GLM native tool calls', () => {
    const adapter = ADAPTER_RESOLVER.resolveAdapter(ZHIPU_PROVIDER_DEFINITION.adapterKey);
    const parsed = adapter.parseResponse(
      {
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'search', arguments: '{"query":"weather"}' },
                },
              ],
            },
          },
        ],
      },
      TRACE_ID,
    );

    expect(parsed.toolCalls).toEqual([
      { name: 'search', params: { query: 'weather' }, id: 'call_1' },
    ]);
  });

  it('returns a text fallback instead of throwing on malformed output', () => {
    const adapter = ADAPTER_RESOLVER.resolveAdapter(ZHIPU_PROVIDER_DEFINITION.adapterKey);
    expect(() => adapter.parseResponse({ unexpected: true }, TRACE_ID)).not.toThrow();
    expect(adapter.parseResponse({ unexpected: true }, TRACE_ID).contentType).toBe('text');
  });
});

describe('zhipu provider leaf — factory', () => {
  it('is registered under the zhipu vendor key', () => {
    expect(resolveProviderFactory('zhipu')).toBe(providerFactory);
    expect(providerFactory.vendorKey).toBe('zhipu');
  });

  it('constructs a ChatCompletionsProvider with the supplied credential', () => {
    const provider = providerFactory.create(zhipuConfig(), { apiKey: 'zhipu-key' });
    expect(provider).toBeInstanceOf(ChatCompletionsProvider);
    expect(provider.getConfig().vendor).toBe('zhipu');
  });

  it('fails closed instead of falling back to OPENAI_API_KEY when no Zhipu key is present', () => {
    const previousZhipu = process.env.ZHIPU_API_KEY;
    const previousOpenai = process.env.OPENAI_API_KEY;
    delete process.env.ZHIPU_API_KEY;
    process.env.OPENAI_API_KEY = 'openai-key-should-not-be-used';
    try {
      expect(() => providerFactory.create(zhipuConfig(), {})).toThrow(/ZHIPU_API_KEY/);
      expect(() => providerFactory.create(zhipuConfig())).toThrow(/ZHIPU_API_KEY/);
    } finally {
      if (previousZhipu === undefined) delete process.env.ZHIPU_API_KEY;
      else process.env.ZHIPU_API_KEY = previousZhipu;
      if (previousOpenai === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousOpenai;
    }
  });

  it('resolves the credential from ZHIPU_API_KEY when no apiKey option is supplied', () => {
    const previousZhipu = process.env.ZHIPU_API_KEY;
    process.env.ZHIPU_API_KEY = 'zhipu-env-key';
    try {
      const provider = providerFactory.create(zhipuConfig());
      expect(provider).toBeInstanceOf(ChatCompletionsProvider);
    } finally {
      if (previousZhipu === undefined) delete process.env.ZHIPU_API_KEY;
      else process.env.ZHIPU_API_KEY = previousZhipu;
    }
  });
});
