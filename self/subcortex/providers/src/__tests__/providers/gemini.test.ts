import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ProviderId } from '@nous/shared';
import { NousError, ValidationError } from '@nous/shared';
import {
  GEMINI_DEFAULT_ENDPOINT,
  GEMINI_DEFAULT_MODEL_ID,
  providerDefinition,
  providerFactory,
  createGeminiAdapter,
  GeminiProvider,
} from '../../providers/gemini/index.js';
import { ProviderDefinitionSchema } from '../../schemas/provider-definition.js';
import { deriveBuiltInProviderId } from '../../provider-identity.js';
import type { AdapterFormatInput } from '../../schemas/provider-adapter.js';

const MOCK_CONFIG = {
  id: deriveBuiltInProviderId('gemini') as ProviderId,
  name: 'Google Gemini',
  type: 'text' as const,
  modelId: GEMINI_DEFAULT_MODEL_ID,
  endpoint: GEMINI_DEFAULT_ENDPOINT,
  isLocal: false,
  capabilities: ['chat', 'streaming'],
};

const TRACE_ID = '00000000-0000-0000-0000-000000000071' as never;

describe('Gemini provider leaf', () => {
  it('exposes native Gemini metadata without hand-authored wellKnownProviderId', () => {
    expect(providerDefinition.vendorKey).toBe('gemini');
    expect(providerDefinition.displayName).toBe('Google Gemini');
    expect(providerDefinition.protocol).toBe('gemini-generate-content');
    expect(providerDefinition.adapterKey).toBe('gemini');
    expect(providerDefinition.defaultEndpoint).toBe('https://generativelanguage.googleapis.com');
    expect(providerDefinition.defaultModelId).toBe('gemini-2.5-flash');
    expect(providerDefinition.auth).toEqual({
      envVar: 'GEMINI_API_KEY',
      vaultKeyNamespace: 'gemini',
      header: {
        name: 'x-goog-api-key',
        scheme: 'raw',
      },
      required: true,
      purpose: 'api_key',
    });
    expect(providerDefinition.capabilities?.streaming).toBe(true);
    expect(providerDefinition.capabilities?.nativeToolUse).toBe(false);
    expect('wellKnownProviderId' in providerDefinition).toBe(false);
  });

  it('satisfies the shared ProviderDefinitionSchema once hydrated with a derived id', () => {
    const hydrated = {
      ...providerDefinition,
      wellKnownProviderId: deriveBuiltInProviderId('gemini') as ProviderId,
    };
    expect(() => ProviderDefinitionSchema.parse(hydrated)).not.toThrow();
  });

  it('factory builds a GeminiProvider for the gemini vendor', () => {
    const provider = providerFactory.create(MOCK_CONFIG, { apiKey: 'test-gemini-key' });
    expect(providerFactory.vendorKey).toBe('gemini');
    expect(provider).toBeInstanceOf(GeminiProvider);
    expect(provider.getConfig()).toEqual(MOCK_CONFIG);
  });
});

describe('createGeminiAdapter', () => {
  const adapter = createGeminiAdapter();

  it('declares text streaming capabilities without native tool use', () => {
    expect(adapter.capabilities).toEqual({
      nativeToolUse: false,
      cacheControl: false,
      extendedThinking: false,
      streaming: true,
    });
  });

  it('formats system prompts and context into TextModelInput messages', () => {
    const input: AdapterFormatInput = {
      systemPrompt: ['Identity', 'Guardrails'],
      context: [
        { role: 'user', content: 'Hello', source: 'initial_context', createdAt: '2026-01-01T00:00:00Z' },
        { role: 'assistant', content: 'Hi', source: 'model_output', createdAt: '2026-01-01T00:00:01Z' },
        { role: 'tool', content: 'tool result', source: 'tool_result', createdAt: '2026-01-01T00:00:02Z' },
      ],
      modelRequirements: { profile: 'fast', fallbackPolicy: 'block_if_unmet' },
    };

    expect(adapter.formatRequest(input).input).toEqual({
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
        { role: 'user', content: 'tool result' },
      ],
      systemSegments: ['Identity', 'Guardrails'],
      model_profile: 'fast',
    });
  });

  it('parses Gemini candidate text into canonical output', () => {
    const result = adapter.parseResponse({
      candidates: [
        {
          content: {
            parts: [{ text: 'Hello, ' }, { text: 'world!' }],
          },
        },
      ],
    }, TRACE_ID);

    expect(result).toEqual({
      response: 'Hello, world!',
      toolCalls: [],
      memoryCandidates: [],
      contentType: 'text',
    });
  });
});

describe('GeminiProvider', () => {
  const originalApiKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    process.env.GEMINI_API_KEY = 'test-gemini-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalApiKey;
    }
  });

  it('constructor throws PROVIDER_AUTH_FAILED when no API key is available', () => {
    delete process.env.GEMINI_API_KEY;

    expect(() => new GeminiProvider(MOCK_CONFIG)).toThrow(NousError);
  });

  it('invoke() validates input and rejects invalid payloads', async () => {
    const provider = new GeminiProvider(MOCK_CONFIG, { apiKey: 'test-gemini-key' });

    await expect(
      provider.invoke({
        role: 'cortex-chat',
        input: {},
        traceId: TRACE_ID,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('invoke() sends native generateContent request and parses response', async () => {
    const provider = new GeminiProvider(
      { ...MOCK_CONFIG, maxTokens: 1024 },
      { apiKey: 'test-gemini-key' },
    );
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: 'Hello from Gemini' }],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 6,
            candidatesTokenCount: 4,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await provider.invoke({
      role: 'cortex-chat',
      input: {
        messages: [
          { role: 'system', content: 'Be concise.' },
          { role: 'user', content: 'Say hello.' },
          { role: 'assistant', content: 'Previous reply.' },
        ],
      },
      traceId: TRACE_ID,
    });

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;

    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    expect(headers['x-goog-api-key']).toBe('test-gemini-key');
    expect(headers.Authorization).toBeUndefined();
    expect(body).toEqual({
      contents: [
        { role: 'user', parts: [{ text: 'Say hello.' }] },
        { role: 'model', parts: [{ text: 'Previous reply.' }] },
      ],
      systemInstruction: {
        parts: [{ text: 'Be concise.' }],
      },
      generationConfig: {
        maxOutputTokens: 1024,
      },
    });
    expect(result).toEqual({
      output: 'Hello from Gemini',
      providerId: MOCK_CONFIG.id,
      usage: {
        inputTokens: 6,
        outputTokens: 4,
        computeMs: undefined,
      },
      traceId: TRACE_ID,
    });
  });

  it('invoke() converts prompt input to a single Gemini user content', async () => {
    const provider = new GeminiProvider(MOCK_CONFIG, { apiKey: 'test-gemini-key' });
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'Prompt response' }] } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await provider.invoke({
      role: 'cortex-chat',
      input: { prompt: 'Write a haiku.' },
      traceId: TRACE_ID,
    });

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;

    expect(body).toEqual({
      contents: [
        { role: 'user', parts: [{ text: 'Write a haiku.' }] },
      ],
      generationConfig: {
        maxOutputTokens: 4096,
      },
    });
  });

  it('stream() parses Gemini SSE chunks and emits usage on the terminal chunk', async () => {
    const provider = new GeminiProvider(MOCK_CONFIG, { apiKey: 'test-gemini-key' });
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"candidates":[{"content":{"parts":[{"text":"Hel"}]}}]}\n\n'));
        controller.enqueue(encoder.encode('data: {"candidates":[{"content":{"parts":[{"text":"lo"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":3,"candidatesTokenCount":2}}\n\n'));
        controller.close();
      },
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    );

    const chunks = [];
    for await (const chunk of provider.stream({
      role: 'cortex-chat',
      input: { prompt: 'Say hello.' },
      traceId: TRACE_ID,
    })) {
      chunks.push(chunk);
    }

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse');
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

  it('stream() times out stalled body reads after response headers arrive', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const provider = new GeminiProvider(
      MOCK_CONFIG,
      { apiKey: 'test-gemini-key', timeoutMs: 50 },
    );
    const stream = new ReadableStream<Uint8Array>({
      cancel,
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    );

    const iterator = provider.stream({
      role: 'cortex-chat',
      input: { prompt: 'Stall after headers.' },
      traceId: TRACE_ID,
    })[Symbol.asyncIterator]();

    const read = iterator.next();
    const expectation = expect(read).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      context: { failoverReasonCode: 'PRV-PROVIDER-UNAVAILABLE' },
    });
    await vi.advanceTimersByTimeAsync(50);

    await expectation;
    expect(cancel).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('stream() cancels the reader when caller aborts during body consumption', async () => {
    const cancel = vi.fn();
    const abortController = new AbortController();
    const provider = new GeminiProvider(MOCK_CONFIG, { apiKey: 'test-gemini-key' });
    const stream = new ReadableStream<Uint8Array>({
      cancel,
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    );

    const iterator = provider.stream({
      role: 'cortex-chat',
      input: { prompt: 'Abort after headers.' },
      traceId: TRACE_ID,
      abortSignal: abortController.signal,
    })[Symbol.asyncIterator]();

    const read = iterator.next();
    await Promise.resolve();
    abortController.abort();

    await expect(read).rejects.toMatchObject({
      code: 'ABORTED',
    });
    expect(cancel).toHaveBeenCalled();
  });

  it('invoke() throws PROVIDER_AUTH_FAILED with PRV-AUTH-FAILURE on 403', async () => {
    const provider = new GeminiProvider(MOCK_CONFIG, { apiKey: 'bad-key' });
    vi.mocked(fetch).mockResolvedValue(new Response('forbidden', { status: 403 }));

    await expect(
      provider.invoke({
        role: 'cortex-chat',
        input: { prompt: 'hi' },
        traceId: TRACE_ID,
      }),
    ).rejects.toMatchObject({
      code: 'PROVIDER_AUTH_FAILED',
      context: { failoverReasonCode: 'PRV-AUTH-FAILURE' },
    });
  });

  it('invoke() throws PROVIDER_UNAVAILABLE with PRV-RATE-LIMIT on 429', async () => {
    const provider = new GeminiProvider(MOCK_CONFIG, { apiKey: 'test-gemini-key' });
    vi.mocked(fetch).mockResolvedValue(new Response('rate limited', { status: 429 }));

    await expect(
      provider.invoke({
        role: 'cortex-chat',
        input: { prompt: 'hi' },
        traceId: TRACE_ID,
      }),
    ).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      context: { failoverReasonCode: 'PRV-RATE-LIMIT' },
    });
  });
});
