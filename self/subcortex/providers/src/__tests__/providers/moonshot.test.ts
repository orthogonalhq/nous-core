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
} from '../../providers/moonshot/index.js';
import { MOONSHOT_PROVIDER_DEFINITION } from '../../providers/moonshot/definition.js';

const TRACE_ID = '550e8400-e29b-41d4-a716-446655440188' as TraceId;
const PROVIDER_ID = '00000000-0000-0000-0000-0000000000aa' as ProviderId;

function moonshotConfig(): ModelProviderConfig {
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

describe('moonshot provider leaf — definition', () => {
  it('exposes the leaf definition under the canonical alias', () => {
    expect(providerDefinition).toBe(MOONSHOT_PROVIDER_DEFINITION);
  });

  it('does not hand-author a built-in provider id', () => {
    expect('wellKnownProviderId' in MOONSHOT_PROVIDER_DEFINITION).toBe(false);
  });

  it('declares Moonshot Kimi identity, protocol, and credential metadata', () => {
    expect(MOONSHOT_PROVIDER_DEFINITION.vendorKey).toBe('moonshot');
    expect(MOONSHOT_PROVIDER_DEFINITION.protocol).toBe('chat-completions');
    expect(MOONSHOT_PROVIDER_DEFINITION.adapterKey).toBe('chat-completions');
    expect(MOONSHOT_PROVIDER_DEFINITION.defaultEndpoint).toBe('https://api.moonshot.ai');
    expect(MOONSHOT_PROVIDER_DEFINITION.defaultModelId).toBe('kimi-k2-0711-preview');
    expect(MOONSHOT_PROVIDER_DEFINITION.isLocal).toBe(false);
    expect(MOONSHOT_PROVIDER_DEFINITION.auth).toEqual({
      envVar: 'MOONSHOT_API_KEY',
      vaultKeyNamespace: 'moonshot',
      required: true,
      purpose: 'api_key',
    });
  });

  it('is hydrated into PROVIDER_DEFINITIONS with a derived built-in id', () => {
    const hydrated = resolveProviderDefinition('moonshot');
    expect(PROVIDER_DEFINITIONS).toContainEqual(hydrated);
    expect(hydrated.wellKnownProviderId).toBe(deriveBuiltInProviderId('moonshot'));
  });

  it('validates through ProviderDefinitionSchema after hydration', () => {
    const hydrated = resolveProviderDefinition('moonshot');
    expect(ProviderDefinitionSchema.parse(hydrated)).toEqual(hydrated);
  });
});

describe('moonshot provider leaf — adapter (Kimi chat completions shape)', () => {
  it('reuses the shared chat-completions adapter', () => {
    expect(providerAdapter).toBe(ADAPTER_RESOLVER.resolveModule('chat-completions'));
  });

  it('parses a Kimi text response', () => {
    const adapter = ADAPTER_RESOLVER.resolveAdapter(MOONSHOT_PROVIDER_DEFINITION.adapterKey);
    const parsed = adapter.parseResponse(
      {
        id: 'chatcmpl-kimi',
        model: 'kimi-k2-0711-preview',
        choices: [{ message: { role: 'assistant', content: 'Hello from Kimi' } }],
        usage: { prompt_tokens: 10, completion_tokens: 3 },
      },
      TRACE_ID,
    );

    expect(parsed.response).toBe('Hello from Kimi');
    expect(parsed.toolCalls).toEqual([]);
    expect(parsed.contentType).toBe('text');
  });

  it('parses Kimi native tool calls', () => {
    const adapter = ADAPTER_RESOLVER.resolveAdapter(MOONSHOT_PROVIDER_DEFINITION.adapterKey);
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
    const adapter = ADAPTER_RESOLVER.resolveAdapter(MOONSHOT_PROVIDER_DEFINITION.adapterKey);
    expect(() => adapter.parseResponse({ unexpected: true }, TRACE_ID)).not.toThrow();
    expect(adapter.parseResponse({ unexpected: true }, TRACE_ID).contentType).toBe('text');
  });
});

describe('moonshot provider leaf — factory', () => {
  it('is registered under the moonshot vendor key', () => {
    expect(resolveProviderFactory('moonshot')).toBe(providerFactory);
    expect(providerFactory.vendorKey).toBe('moonshot');
  });

  it('constructs a ChatCompletionsProvider with the supplied credential', () => {
    const provider = providerFactory.create(moonshotConfig(), { apiKey: 'moonshot-key' });
    expect(provider).toBeInstanceOf(ChatCompletionsProvider);
    expect(provider.getConfig().vendor).toBe('moonshot');
  });
});
