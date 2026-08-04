import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProviderId, TraceId } from '@nous/shared';
import { NousError } from '@nous/shared';
import {
  PROVIDER_DEFINITIONS,
  ProviderDefinitionSchema,
  resolveProviderDefinition,
} from '../provider-definitions.js';
import { resolveProviderFactory } from '../provider-factories.js';
import { deriveBuiltInProviderId } from '../provider-identity.js';
import { resolveAdapter, resolveAdapterKeyFromConfig } from '../adapter-resolver.js';
import { ChatCompletionsProvider } from '../protocols/openai-api/provider.js';
import type { ProviderDefinitionLeaf } from '../schemas/provider-definition.js';
import { providerDefinition } from '../providers/together/definition.js';
import { providerFactory } from '../providers/together/provider.js';
import { providerAdapter } from '../providers/together/adapter.js';

const TOGETHER_CONFIG = {
  id: '00000000-0000-0000-0000-000000000100' as ProviderId,
  name: 'together',
  type: 'text' as const,
  endpoint: 'https://api.together.ai',
  modelId: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  isLocal: false,
  capabilities: ['text'],
};

const TRACE_ID = '00000000-0000-0000-0000-000000000002' as TraceId;

describe('Together provider definition', () => {
  it('declares OpenAI-compatible chat-completions metadata', () => {
    expect(providerDefinition.vendorKey).toBe('together');
    expect(providerDefinition.displayName).toBe('Together AI');
    expect(providerDefinition.protocol).toBe('chat-completions');
    expect(providerDefinition.adapterKey).toBe('chat-completions');
    expect(providerDefinition.providerType).toBe('text');
    expect(providerDefinition.providerClass).toBe('remote_text');
    expect(providerDefinition.defaultEndpoint).toBe('https://api.together.ai');
    expect(providerDefinition.defaultModelId).toBe('meta-llama/Llama-3.3-70B-Instruct-Turbo');
    expect(providerDefinition.isLocal).toBe(false);
  });

  it('declares vault-backed API-key auth with a bearer Authorization header', () => {
    expect(providerDefinition.auth).toEqual({
      envVar: 'TOGETHER_API_KEY',
      vaultKeyNamespace: 'together',
      header: { name: 'Authorization', scheme: 'bearer' },
      required: true,
      purpose: 'api_key',
    });
  });

  it('declares /v1/models as a health-check endpoint, not a model-list endpoint', () => {
    // Together's /v1/models returns a bare top-level array, not the
    // { data: [...] } envelope the openai-models parser requires — so it's
    // used for key validation (HTTP status only) rather than model listing.
    expect(providerDefinition.healthCheckEndpoint).toBe('/v1/models');
    // The leaf is narrowed by `as const`; widen to the leaf contract so the
    // optional discovery fields are addressable and asserted absent.
    const leaf: ProviderDefinitionLeaf = providerDefinition;
    expect(leaf.modelListEndpoint).toBeUndefined();
    expect(leaf.modelListFormat).toBeUndefined();
    expect(leaf.capabilities?.modelListing).toBeUndefined();
  });

  it('does not hand-author wellKnownProviderId on the leaf', () => {
    expect('wellKnownProviderId' in providerDefinition).toBe(false);
  });
});

describe('Together provider catalog hydration', () => {
  it('is present in PROVIDER_DEFINITIONS and validates against the schema', () => {
    const hydrated = resolveProviderDefinition('together');
    expect(PROVIDER_DEFINITIONS).toContain(hydrated);
    expect(ProviderDefinitionSchema.parse(hydrated)).toEqual(hydrated);
  });

  it('derives a stable built-in provider id from vendorKey', () => {
    expect(resolveProviderDefinition('together').wellKnownProviderId).toBe(
      deriveBuiltInProviderId('together'),
    );
  });
});

describe('Together provider factory', () => {
  it('is registered under the together vendor key', () => {
    const factory = resolveProviderFactory('together');
    expect(factory).toBeDefined();
    expect(factory!.vendorKey).toBe('together');
    expect(providerFactory.vendorKey).toBe('together');
  });

  it('constructs a ChatCompletionsProvider with the resolved key and endpoint', () => {
    const provider = providerFactory.create(TOGETHER_CONFIG, {
      apiKey: 'test-together-key',
    });
    expect(provider).toBeInstanceOf(ChatCompletionsProvider);
    expect(provider.getConfig().endpoint).toBe('https://api.together.ai');
    expect(provider.getConfig().modelId).toBe('meta-llama/Llama-3.3-70B-Instruct-Turbo');
  });
});

describe('Together factory fails closed on missing credentials', () => {
  const priorTogether = process.env.TOGETHER_API_KEY;
  const priorOpenai = process.env.OPENAI_API_KEY;

  afterEach(() => {
    if (priorTogether === undefined) delete process.env.TOGETHER_API_KEY;
    else process.env.TOGETHER_API_KEY = priorTogether;
    if (priorOpenai === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = priorOpenai;
  });

  it('throws instead of falling back to OPENAI_API_KEY when no Together key is present', () => {
    delete process.env.TOGETHER_API_KEY;
    // An OpenAI credential must never be silently sent to api.together.ai.
    process.env.OPENAI_API_KEY = 'sk-openai-must-not-be-used';
    expect(() => providerFactory.create(TOGETHER_CONFIG, {})).toThrow(NousError);
    expect(() => providerFactory.create(TOGETHER_CONFIG, {})).toThrow(/Together AI API key required/);
  });

  it('constructs when only TOGETHER_API_KEY is present', () => {
    delete process.env.OPENAI_API_KEY;
    process.env.TOGETHER_API_KEY = 'together-test-key';
    expect(providerFactory.create(TOGETHER_CONFIG, {})).toBeInstanceOf(ChatCompletionsProvider);
  });
});

describe('Together request URL composition', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls Together at /v1/chat/completions', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const provider = providerFactory.create(TOGETHER_CONFIG, {
      apiKey: 'together-test-key',
    });
    await provider.invoke({
      role: 'cortex-chat',
      input: { prompt: 'ping' },
      traceId: TRACE_ID,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.together.ai/v1/chat/completions');
  });
});

describe('Together adapter resolution', () => {
  it('reuses the shared chat-completions adapter module', () => {
    expect(providerAdapter.adapterKey).toBe('chat-completions');
  });

  it('resolves to the chat-completions adapter from a together-vendor config', () => {
    expect(resolveAdapterKeyFromConfig({ getConfig: () => ({ vendor: 'together' }) })).toBe(
      'chat-completions',
    );
    expect(resolveAdapter('chat-completions').capabilities.nativeToolUse).toBe(true);
  });
});

describe('Together streaming', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stream() parses OpenAI-style SSE chunks and emits usage on the terminal chunk', async () => {
    const provider = providerFactory.create(TOGETHER_CONFIG, {
      apiKey: 'together-test-key',
    });
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode('data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n'),
        );
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":2}}\n\n',
          ),
        );
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
      ),
    );

    const chunks = [];
    for await (const chunk of provider.stream({
      role: 'cortex-chat',
      input: { prompt: 'Say hello.' },
      traceId: TRACE_ID,
    })) {
      chunks.push(chunk);
    }

    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://api.together.ai/v1/chat/completions');
    expect(chunks).toEqual([
      { content: 'Hel', done: false, usage: undefined },
      {
        content: 'lo',
        done: true,
        usage: {
          inputTokens: 3,
          outputTokens: 2,
        },
      },
    ]);
  });

  it('stream() releases the reader lock once the body is fully consumed', async () => {
    const provider = providerFactory.create(TOGETHER_CONFIG, {
      apiKey: 'together-test-key',
    });
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode('data: {"choices":[{"delta":{"content":"hi"},"finish_reason":"stop"}]}\n\n'),
        );
        controller.close();
      },
    });
    const response = new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
    const realGetReader = response.body!.getReader.bind(response.body);
    const releaseLockSpy = vi.fn();
    vi.spyOn(response.body!, 'getReader').mockImplementation(() => {
      const reader = realGetReader();
      const originalRelease = reader.releaseLock.bind(reader);
      reader.releaseLock = () => {
        releaseLockSpy();
        originalRelease();
      };
      return reader;
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    for await (const _chunk of provider.stream({
      role: 'cortex-chat',
      input: { prompt: 'Say hi.' },
      traceId: TRACE_ID,
    })) {
      // drain
    }

    expect(releaseLockSpy).toHaveBeenCalledTimes(1);
  });
});
