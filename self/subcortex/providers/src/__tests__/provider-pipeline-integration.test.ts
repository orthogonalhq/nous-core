import { afterEach, describe, expect, it } from 'vitest';
import type { ProviderId, TraceId } from '@nous/shared';
import { LaneAwareProvider } from '@nous/subcortex-inference-runtime';
import {
  ADAPTER_MODULES,
  ADAPTER_RESOLVER,
  AnthropicProvider,
  ChatCompletionsProvider,
  CERTIFIED_PROVIDER_FACTORIES,
  CodexCliProvider,
  OllamaProvider,
  PROVIDER_DEFINITIONS,
  ProviderRegistry,
  buildAdapterResolver,
  defineProvider,
  defineProviderAdapter,
  resolveProviderDefinition,
  textAdapter,
} from '../index.js';

const TRACE_ID = '550e8400-e29b-41d4-a716-446655440000' as TraceId;

function createEmptyConfig() {
  return {
    get: () => ({ providers: [] }),
    getSection: () => undefined,
    update: async () => undefined,
    reload: async () => undefined,
  } as any;
}

function configFromDefinition(definition: (typeof PROVIDER_DEFINITIONS)[number]) {
  return {
    id: definition.wellKnownProviderId,
    name: definition.vendorKey,
    type: definition.providerType,
    endpoint: definition.defaultEndpoint,
    modelId: definition.defaultModelId,
    isLocal: definition.isLocal,
    capabilities: ['chat', 'streaming'],
    providerClass: definition.providerClass,
    vendor: definition.vendorKey,
  };
}

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GROQ_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
});

describe('provider definition to adapter to registry pipeline', () => {
  it('aggregates all production provider definitions by vendor key', () => {
    expect(PROVIDER_DEFINITIONS.map((definition) => definition.vendorKey)).toEqual([
      'anthropic',
      'codex-cli',
      'groq',
      'llama-cpp',
      'ollama',
      'openai',
      'openrouter',
    ]);
    expect(resolveProviderDefinition('anthropic').defaultModelId).toBe(
      'claude-sonnet-4-20250514',
    );
    expect(resolveProviderDefinition('openai').adapterKey).toBe('chat-completions');
    expect(resolveProviderDefinition('ollama').auth.required).toBe(false);
  });

  it('makes a leaf provider definition discoverable through typed aggregation', () => {
    const fixtureDefinition = defineProvider({
      vendorKey: 'fixture',
      displayName: 'Fixture',
      wellKnownProviderId: '20000000-0000-0000-0000-000000000001' as ProviderId,
      providerType: 'text',
      providerClass: 'remote_text',
      protocol: 'fixture-chat',
      adapterKey: 'fixture-chat',
      defaultEndpoint: 'https://fixture.example.com',
      defaultModelId: 'fixture-1',
      auth: {
        envVar: 'FIXTURE_API_KEY',
        vaultKeyNamespace: 'fixture',
        required: true,
        purpose: 'api_key',
      },
      isLocal: false,
    });

    const localDefinitions = [...PROVIDER_DEFINITIONS, fixtureDefinition] as const;

    expect(localDefinitions.find((definition) => definition.vendorKey === 'fixture')).toBe(
      fixtureDefinition,
    );
  });

  it('resolves every provider definition adapter key to a module with the module-object contract', () => {
    for (const definition of PROVIDER_DEFINITIONS) {
      const module = ADAPTER_RESOLVER.resolveModule(definition.adapterKey);

      expect(module.adapterKey).toBe(definition.adapterKey);
      expect(module.displayName.length).toBeGreaterThan(0);
      expect(module.protocol.length).toBeGreaterThan(0);
      expect(module.capabilities).toEqual(
        expect.objectContaining({
          nativeToolUse: expect.any(Boolean),
          cacheControl: expect.any(Boolean),
          extendedThinking: expect.any(Boolean),
          streaming: expect.any(Boolean),
        }),
      );
      expect(typeof module.create).toBe('function');
    }
  });

  it('parses representative response shapes for each production provider adapter', () => {
    const cases = [
      {
        adapterKey: 'anthropic',
        output: { content: [{ type: 'text', text: 'Anthropic response' }] },
        expected: 'Anthropic response',
      },
      {
        adapterKey: 'chat-completions',
        output: { choices: [{ message: { content: 'Chat response' } }] },
        expected: 'Chat response',
      },
      {
        adapterKey: 'codex-cli',
        output: 'Codex CLI response',
        expected: 'Codex CLI response',
      },
      {
        adapterKey: 'ollama',
        output: { content: 'Ollama response' },
        expected: 'Ollama response',
      },
    ];

    for (const testCase of cases) {
      const adapter = ADAPTER_RESOLVER.resolveAdapter(testCase.adapterKey);
      const parsed = adapter.parseResponse(testCase.output, TRACE_ID);

      expect(parsed.response).toBe(testCase.expected);
      expect(parsed.toolCalls).toEqual([]);
      expect(parsed.contentType).toBe('text');
    }
  });

  it('keeps adapter parsing no-throw with text fallback for malformed outputs', () => {
    for (const module of ADAPTER_MODULES) {
      const adapter = ADAPTER_RESOLVER.resolveAdapter(module.adapterKey);

      expect(() => adapter.parseResponse({ unexpected: true }, TRACE_ID)).not.toThrow();
      expect(adapter.parseResponse({ unexpected: true }, TRACE_ID).contentType).toBe('text');
    }
  });

  it('constructs providers from registry-derived definitions with env-var credentials', () => {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.GROQ_API_KEY = 'test-groq-key';
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';

    const registry = new ProviderRegistry(createEmptyConfig());
    const expectedClassByVendor = {
      anthropic: AnthropicProvider,
      'codex-cli': CodexCliProvider,
      'llama-cpp': ChatCompletionsProvider,
      openai: ChatCompletionsProvider,
      groq: ChatCompletionsProvider,
      ollama: OllamaProvider,
      openrouter: ChatCompletionsProvider,
    };

    for (const definition of PROVIDER_DEFINITIONS) {
      registry.registerProvider(configFromDefinition(definition));
      const provider = registry.getProvider(definition.wellKnownProviderId) as any;

      expect(provider).toBeInstanceOf(LaneAwareProvider);
      expect(provider.inner).toBeInstanceOf(expectedClassByVendor[definition.vendorKey]);
      expect(provider.getConfig().vendor).toBe(definition.vendorKey);
    }
  });

  it('aggregates provider factories in the same vendor order as definitions', () => {
    expect(CERTIFIED_PROVIDER_FACTORIES.map((factory) => factory.vendorKey)).toEqual(
      PROVIDER_DEFINITIONS.map((definition) => definition.vendorKey),
    );
  });

  it('skips auth-required providers without matching env vars and keeps Ollama credential-free', () => {
    const registry = new ProviderRegistry({
      get: () => ({
        providers: PROVIDER_DEFINITIONS.map(configFromDefinition),
      }),
      getSection: () => undefined,
      update: async () => undefined,
      reload: async () => undefined,
    } as any);

    expect(registry.getProvider(resolveProviderDefinition('anthropic').wellKnownProviderId)).toBeNull();
    expect(registry.getProvider(resolveProviderDefinition('codex-cli').wellKnownProviderId)).toBeInstanceOf(
      LaneAwareProvider,
    );
    expect(registry.getProvider(resolveProviderDefinition('openai').wellKnownProviderId)).toBeNull();
    expect(registry.getProvider(resolveProviderDefinition('ollama').wellKnownProviderId)).toBeInstanceOf(
      LaneAwareProvider,
    );
  });

  it('supports a mock leaf adapter through typed adapter aggregation', () => {
    const fixtureAdapter = defineProviderAdapter({
      adapterKey: 'fixture-chat',
      displayName: 'Fixture Chat',
      protocol: 'fixture-chat',
      capabilities: {
        nativeToolUse: false,
        cacheControl: false,
        extendedThinking: false,
        streaming: false,
      },
      create() {
        return {
          capabilities: this.capabilities,
          formatRequest(input) {
            return { input: { prompt: input.systemPrompt } };
          },
          parseResponse(output) {
            return {
              response: String(output ?? ''),
              toolCalls: [],
              memoryCandidates: [],
              contentType: 'text',
            };
          },
        };
      },
    });

    const resolver = buildAdapterResolver([...ADAPTER_MODULES, fixtureAdapter] as const);

    expect(resolver.resolveModule('fixture-chat')).toBe(fixtureAdapter);
    expect(resolver.resolveAdapter('fixture-chat').parseResponse('ok', TRACE_ID).response).toBe(
      'ok',
    );
    expect(resolver.resolveAdapter('missing').capabilities).toEqual(textAdapter.capabilities);
  });
});
