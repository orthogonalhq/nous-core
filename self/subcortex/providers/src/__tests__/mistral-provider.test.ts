/**
 * Mistral provider leaf tests.
 *
 * Covers the testing checklist requirements:
 * - Definition: schema validation, vendorKey, adapterKey, protocol, auth metadata.
 * - Adapter: formatRequest (system prompt, context, tools), parseResponse (text,
 *   tool_calls, malformed, no-throw contract).
 * - Provider implementation: input validation, request shape, auth header, error
 *   classification (401/403, 429, unavailable), streaming, timeout, abort.
 *
 * Uses Mistral-shaped fixtures — not copied from Anthropic tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ProviderId } from '@nous/shared';
import { NousError, ValidationError } from '@nous/shared';
import { MistralProvider, MISTRAL_PROVIDER_DEFINITION } from '../providers/mistral/implementation.js';
import { createMistralAdapter } from '../providers/mistral/adapter.js';
import type { AdapterFormatInput } from '../schemas/provider-adapter.js';
import { ProviderDefinitionSchema } from '../schemas/provider-definition.js';

const MOCK_CONFIG = {
  id: '00000000-0000-0000-0000-000000000201' as ProviderId,
  name: 'Mistral',
  type: 'text' as const,
  modelId: 'mistral-large-latest',
  endpoint: 'https://api.mistral.ai',
  isLocal: false,
  capabilities: ['chat', 'streaming'],
};

const TRACE_ID = '00000000-0000-0000-0000-000000000202' as any;

describe('MISTRAL_PROVIDER_DEFINITION', () => {
  it('satisfies ProviderDefinitionSchema', () => {
    expect(() =>
      ProviderDefinitionSchema.parse({
        ...MISTRAL_PROVIDER_DEFINITION,
        wellKnownProviderId: '00000000-0000-0000-0000-000000000000',
      }),
    ).not.toThrow();
  });

  it('has correct vendorKey, adapterKey, and protocol', () => {
    expect(MISTRAL_PROVIDER_DEFINITION.vendorKey).toBe('mistral');
    expect(MISTRAL_PROVIDER_DEFINITION.adapterKey).toBe('mistral');
    expect(MISTRAL_PROVIDER_DEFINITION.protocol).toBe('chat-completions');
  });

  it('declares api_key auth with correct env var and vault namespace', () => {
    expect(MISTRAL_PROVIDER_DEFINITION.auth.purpose).toBe('api_key');
    expect(MISTRAL_PROVIDER_DEFINITION.auth.required).toBe(true);
    expect(MISTRAL_PROVIDER_DEFINITION.auth.envVar).toBe('MISTRAL_API_KEY');
    expect(MISTRAL_PROVIDER_DEFINITION.auth.vaultKeyNamespace).toBe('mistral');
  });

  it('declares bearer auth header for model discovery', () => {
    expect(MISTRAL_PROVIDER_DEFINITION.auth.header).toEqual({
      name: 'Authorization',
      scheme: 'bearer',
    });
  });

  it('opts into model listing with correct endpoint and format', () => {
    expect(MISTRAL_PROVIDER_DEFINITION.modelListEndpoint).toBe('/v1/models');
    expect(MISTRAL_PROVIDER_DEFINITION.modelListFormat).toBe('openai-models');
    expect(MISTRAL_PROVIDER_DEFINITION.capabilities?.modelListing).toBe(true);
  });

  it('is not a local provider', () => {
    expect(MISTRAL_PROVIDER_DEFINITION.isLocal).toBe(false);
  });

  it('does not declare wellKnownProviderId — derived from vendorKey by catalog', () => {
    expect((MISTRAL_PROVIDER_DEFINITION as Record<string, unknown>).wellKnownProviderId).toBeUndefined();
  });

  it('does not declare cacheControl or extendedThinking capabilities', () => {
    expect(MISTRAL_PROVIDER_DEFINITION.capabilities?.cacheControl).toBe(false);
    expect(MISTRAL_PROVIDER_DEFINITION.capabilities?.extendedThinking).toBe(false);
  });
});

describe('createMistralAdapter', () => {
  const adapter = createMistralAdapter();

  describe('capabilities', () => {
    it('declares streaming; no nativeToolUse, cacheControl, or extendedThinking', () => {
      expect(adapter.capabilities).toEqual({
        nativeToolUse: false,
        cacheControl: false,
        extendedThinking: false,
        streaming: true,
      });
    });
  });

  describe('formatRequest', () => {
    it('places string system prompt as first system message', () => {
      const input: AdapterFormatInput = {
        systemPrompt: 'You are a helpful assistant.',
        context: [],
      };
      const result = adapter.formatRequest(input);
      const messages = result.input.messages as Array<{ role: string; content: string }>;
      expect(messages[0]).toEqual({ role: 'system', content: 'You are a helpful assistant.' });
    });

    it('flattens string[] system prompt to a joined string', () => {
      const input: AdapterFormatInput = {
        systemPrompt: ['Identity block', 'Task frame', 'Guardrails'],
        context: [],
      };
      const result = adapter.formatRequest(input);
      const messages = result.input.messages as Array<{ role: string; content: string }>;
      expect(messages[0]).toEqual({
        role: 'system',
        content: 'Identity block\nTask frame\nGuardrails',
      });
    });

    it('appends context messages after the system message', () => {
      const input: AdapterFormatInput = {
        systemPrompt: 'Be concise.',
        context: [
          { role: 'user', content: 'Hello', source: 'initial_context', createdAt: '2026-01-01T00:00:00Z' },
          { role: 'assistant', content: 'Hi!', source: 'model_output', createdAt: '2026-01-01T00:00:01Z' },
        ],
      };
      const result = adapter.formatRequest(input);
      const messages = result.input.messages as Array<{ role: string; content: string }>;
      expect(messages).toHaveLength(3);
      expect(messages[0].role).toBe('system');
      expect(messages[1]).toEqual({ role: 'user', content: 'Hello' });
      expect(messages[2]).toEqual({ role: 'assistant', content: 'Hi!' });
    });

    it('does not emit tools in request body when nativeToolUse is false', () => {
      const input: AdapterFormatInput = {
        systemPrompt: 'test',
        context: [],
        toolDefinitions: [
          {
            name: 'search',
            version: '1.0.0',
            description: 'Search for files',
            inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
            outputSchema: {},
            capabilities: ['read'],
            permissionScope: 'project',
          },
        ],
      };
       const result = adapter.formatRequest(input);
      expect(result.input.tools).toBeUndefined();
    });

    it('omits tools key when no tool definitions are provided', () => {
      const input: AdapterFormatInput = { systemPrompt: 'test', context: [] };
      const result = adapter.formatRequest(input);
      expect(result.input.tools).toBeUndefined();
    });
  });

  describe('parseResponse', () => {
    it('parses chat completions text response', () => {
      const output = {
        choices: [{ message: { content: 'Hello from Mistral' }, finish_reason: 'stop' }],
      };
      const result = adapter.parseResponse(output, TRACE_ID);
      expect(result.response).toBe('Hello from Mistral');
      expect(result.toolCalls).toEqual([]);
      expect(result.contentType).toBe('text');
    });

    it('parses tool_calls from chat completions response', () => {
      const output = {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call_abc123',
                  type: 'function',
                  function: { name: 'search', arguments: '{"query":"test"}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      };
      const result = adapter.parseResponse(output, TRACE_ID);
      expect(result.toolCalls).toEqual([
        { name: 'search', params: { query: 'test' }, id: 'call_abc123' },
      ]);
    });

    it('returns empty response string when message content is null', () => {
      const output = {
        choices: [{ message: { content: null }, finish_reason: 'stop' }],
      };
      const result = adapter.parseResponse(output, TRACE_ID);
      expect(result.response).toBe('');
      expect(result.toolCalls).toEqual([]);
    });

    it('parses plain string output', () => {
      const result = adapter.parseResponse('plain string response', TRACE_ID);
      expect(result.response).toBe('plain string response');
      expect(result.contentType).toBe('text');
    });

    it('never throws on malformed output', () => {
      expect(() => adapter.parseResponse(null, TRACE_ID)).not.toThrow();
      expect(() => adapter.parseResponse(undefined, TRACE_ID)).not.toThrow();
      expect(() => adapter.parseResponse(42, TRACE_ID)).not.toThrow();
      expect(() => adapter.parseResponse({ choices: 'not-an-array' }, TRACE_ID)).not.toThrow();
      expect(() => adapter.parseResponse({ choices: [null] }, TRACE_ID)).not.toThrow();
    });

    it('returns fallback string for completely unexpected output', () => {
      const result = adapter.parseResponse({ unexpected: true }, TRACE_ID);
      expect(typeof result.response).toBe('string');
      expect(result.toolCalls).toEqual([]);
    });
  });
});

describe('MistralProvider', () => {
  const originalApiKey = process.env.MISTRAL_API_KEY;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    process.env.MISTRAL_API_KEY = 'test-mistral-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalApiKey === undefined) {
      delete process.env.MISTRAL_API_KEY;
    } else {
      process.env.MISTRAL_API_KEY = originalApiKey;
    }
  });

  it('implements IModelProvider — getConfig returns config', () => {
    const provider = new MistralProvider(MOCK_CONFIG, { apiKey: 'test-mistral-key' });
    expect(provider.getConfig()).toEqual(MOCK_CONFIG);
  });

  it('constructor throws PROVIDER_AUTH_FAILED when no API key is available', () => {
    delete process.env.MISTRAL_API_KEY;
    expect(() => new MistralProvider(MOCK_CONFIG)).toThrow(NousError);
  });

  it('invoke() validates input — rejects invalid shape with ValidationError', async () => {
    const provider = new MistralProvider(MOCK_CONFIG, { apiKey: 'test-mistral-key' });
    await expect(
      provider.invoke({ role: 'cortex-chat', input: {}, traceId: TRACE_ID }),
    ).rejects.toThrow(ValidationError);
  });

  it('invoke() sends Chat Completions body with Bearer auth header', async () => {
    const provider = new MistralProvider(
      { ...MOCK_CONFIG, maxTokens: 1024 },
      { apiKey: 'test-mistral-key' },
    );
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Hello from Mistral' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
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

    expect(url).toBe('https://api.mistral.ai/v1/chat/completions');
    expect(headers['Authorization']).toBe('Bearer test-mistral-key');
    expect(headers['x-api-key']).toBeUndefined();
    expect(body).toEqual({
      model: 'mistral-large-latest',
      max_tokens: 1024,
      messages: [
        { role: 'system', content: 'Be concise.' },
        { role: 'user', content: 'Say hello.' },
        { role: 'assistant', content: 'Previous reply.' },
      ],
      stream: false,
    });
    expect(result).toEqual({
      output: 'Hello from Mistral',
      providerId: MOCK_CONFIG.id,
      usage: { inputTokens: 10, outputTokens: 5, computeMs: undefined },
      traceId: TRACE_ID,
    });
  });

  it('invoke() converts { prompt } input to a single user message', async () => {
    const provider = new MistralProvider(MOCK_CONFIG, { apiKey: 'test-mistral-key' });
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Prompt response' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 3, completion_tokens: 2 },
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
      model: 'mistral-large-latest',
      max_tokens: 4096,
      messages: [{ role: 'user', content: 'Write a haiku.' }],
      stream: false,
    });
  });

  it('invoke() throws PROVIDER_AUTH_FAILED with PRV-AUTH-FAILURE on 401', async () => {
    const provider = new MistralProvider(MOCK_CONFIG, { apiKey: 'bad-key' });
    vi.mocked(fetch).mockResolvedValue(new Response('unauthorized', { status: 401 }));
    await expect(
      provider.invoke({ role: 'cortex-chat', input: { prompt: 'hi' }, traceId: TRACE_ID }),
    ).rejects.toMatchObject({
      code: 'PROVIDER_AUTH_FAILED',
      context: { failoverReasonCode: 'PRV-AUTH-FAILURE' },
    });
  });

  it('invoke() throws PROVIDER_AUTH_FAILED with PRV-AUTH-FAILURE on 403', async () => {
    const provider = new MistralProvider(MOCK_CONFIG, { apiKey: 'bad-key' });
    vi.mocked(fetch).mockResolvedValue(new Response('forbidden', { status: 403 }));
    await expect(
      provider.invoke({ role: 'cortex-chat', input: { prompt: 'hi' }, traceId: TRACE_ID }),
    ).rejects.toMatchObject({
      code: 'PROVIDER_AUTH_FAILED',
      context: { failoverReasonCode: 'PRV-AUTH-FAILURE' },
    });
  });

  it('invoke() throws PROVIDER_UNAVAILABLE with PRV-RATE-LIMIT on 429', async () => {
    const provider = new MistralProvider(MOCK_CONFIG, { apiKey: 'test-mistral-key' });
    vi.mocked(fetch).mockResolvedValue(new Response('rate limited', { status: 429 }));
    await expect(
      provider.invoke({ role: 'cortex-chat', input: { prompt: 'hi' }, traceId: TRACE_ID }),
    ).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      context: { failoverReasonCode: 'PRV-RATE-LIMIT' },
    });
  });

  it('invoke() throws PROVIDER_UNAVAILABLE with PRV-PROVIDER-UNAVAILABLE on 500', async () => {
    const provider = new MistralProvider(MOCK_CONFIG, { apiKey: 'test-mistral-key' });
    vi.mocked(fetch).mockResolvedValue(new Response('internal error', { status: 500 }));
    await expect(
      provider.invoke({ role: 'cortex-chat', input: { prompt: 'hi' }, traceId: TRACE_ID }),
    ).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      context: { failoverReasonCode: 'PRV-PROVIDER-UNAVAILABLE' },
    });
  });

  it('stream() parses Chat Completions SSE deltas and emits done chunk with usage', async () => {
    const provider = new MistralProvider(MOCK_CONFIG, { apiKey: 'test-mistral-key' });
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            [
              'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}',
              '',
              'data: {"choices":[{"delta":{"content":" world"},"finish_reason":null}]}',
              '',
              'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":8,"completion_tokens":3}}',
              '',
              'data: [DONE]',
              '',
            ].join('\n'),
          ),
        );
        controller.close();
      },
    });
    vi.mocked(fetch).mockResolvedValue(new Response(stream, { status: 200 }));

    const chunks: Array<{ content: string; done: boolean; usage?: unknown }> = [];
    for await (const chunk of provider.stream({
      role: 'cortex-chat',
      input: { prompt: 'Stream this.' },
      traceId: TRACE_ID,
    })) {
      chunks.push(chunk);
    }

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;

    expect(body.stream).toBe(true);
    expect(chunks).toEqual([
      { content: 'Hello', done: false },
      { content: ' world', done: false },
      { content: '', done: true, usage: { inputTokens: 8, outputTokens: 3 } },
    ]);
  });
});

describe('MistralProvider — invoke() tool_calls passthrough (Issue 2)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    process.env.MISTRAL_API_KEY = 'test-mistral-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.MISTRAL_API_KEY;
  });

  it('returns structured {choices} output when response contains tool_calls', async () => {
    const provider = new MistralProvider(MOCK_CONFIG, { apiKey: 'test-mistral-key' });
    const toolCallResponse = {
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              { id: 'call_abc', type: 'function', function: { name: 'search', arguments: '{"q":"test"}' } },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(toolCallResponse), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    const result = await provider.invoke({
      role: 'cortex-chat',
      input: { prompt: 'Call a tool.' },
      traceId: TRACE_ID,
    });

    expect(result.output).toEqual({ choices: toolCallResponse.choices });
  });

  it('returns string output when response has no tool_calls', async () => {
    const provider = new MistralProvider(MOCK_CONFIG, { apiKey: 'test-mistral-key' });
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'text reply' }, finish_reason: 'stop' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await provider.invoke({
      role: 'cortex-chat',
      input: { prompt: 'hi' },
      traceId: TRACE_ID,
    });

    expect(result.output).toBe('text reply');
  });
});

describe('MistralProvider — stream() finish_reason tool_calls (Issue 3)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    process.env.MISTRAL_API_KEY = 'test-mistral-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.MISTRAL_API_KEY;
  });

  it('emits done chunk when finish_reason is tool_calls', async () => {
    const provider = new MistralProvider(MOCK_CONFIG, { apiKey: 'test-mistral-key' });
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            [
              'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":5,"completion_tokens":2}}',
              '',
              'data: [DONE]',
              '',
            ].join('\n'),
          ),
        );
        controller.close();
      },
    });
    vi.mocked(fetch).mockResolvedValue(new Response(stream, { status: 200 }));

    const chunks: Array<{ content: string; done: boolean }> = [];
    for await (const chunk of provider.stream({
      role: 'cortex-chat',
      input: { prompt: 'call a tool' },
      traceId: TRACE_ID,
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toContainEqual(expect.objectContaining({ done: true }));
  });
});

describe('MistralProvider — getChatUrl endpoint normalization (Issue 5)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    process.env.MISTRAL_API_KEY = 'test-mistral-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.MISTRAL_API_KEY;
  });

  it('does not double-append /v1 when endpoint already ends with /v1', async () => {
    const provider = new MistralProvider(
      { ...MOCK_CONFIG, endpoint: 'https://api.mistral.ai/v1' },
      { apiKey: 'test-mistral-key' },
    );
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await provider.invoke({ role: 'cortex-chat', input: { prompt: 'hi' }, traceId: TRACE_ID });

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.mistral.ai/v1/chat/completions');
  });

  it('does not double-append /v1 when endpoint ends with /v1/', async () => {
    const provider = new MistralProvider(
      { ...MOCK_CONFIG, endpoint: 'https://api.mistral.ai/v1/' },
      { apiKey: 'test-mistral-key' },
    );
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await provider.invoke({ role: 'cortex-chat', input: { prompt: 'hi' }, traceId: TRACE_ID });

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.mistral.ai/v1/chat/completions');
  });
});

describe('createMistralAdapter — formatRequest tool frame handling (Issue 4)', () => {
  const adapter = createMistralAdapter();

  it('emits tool role with tool_call_id when frame has metadata.tool_call_id', () => {
    const input: AdapterFormatInput = {
      systemPrompt: 'test',
      context: [
        {
          role: 'tool',
          content: '{"result":"ok"}',
          source: 'tool_result',
          createdAt: '2026-01-01T00:00:00Z',
          metadata: { tool_call_id: 'call_abc123' },
        },
      ],
    };
    const result = adapter.formatRequest(input);
    const messages = result.input.messages as Array<{ role: string; content: string; tool_call_id?: string }>;
    const toolMsg = messages.find((m) => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    expect(toolMsg?.tool_call_id).toBe('call_abc123');
    expect(toolMsg?.content).toBe('{"result":"ok"}');
  });

  it('falls back to user role when tool frame has no metadata.tool_call_id', () => {
    const input: AdapterFormatInput = {
      systemPrompt: 'test',
      context: [
        { role: 'tool', content: 'result text', source: 'tool_result', createdAt: '2026-01-01T00:00:00Z' },
      ],
    };
    const result = adapter.formatRequest(input);
    const messages = result.input.messages as Array<{ role: string; content: string }>;
    const toolMsg = messages.find((m) => m.content === 'result text');
    expect(toolMsg?.role).toBe('user');
  });
});

describe('createMistralAdapter — parseResponse missing message (Issue 7)', () => {
  const adapter = createMistralAdapter();

  it('returns empty string when choices[0].message is absent', () => {
    const result = adapter.parseResponse({ choices: [{ finish_reason: 'stop' }] }, TRACE_ID);
    expect(result.response).toBe('');
    expect(result.toolCalls).toEqual([]);
  });

  it('returns empty string when choices array is empty', () => {
    const result = adapter.parseResponse({ choices: [] }, TRACE_ID);
    expect(result.response).toBe('');
  });
});

describe('MISTRAL_PROVIDER_DEFINITION — adapterKey isolation (Issue 1)', () => {
  it('adapterKey is mistral, not chat-completions', () => {
    expect(MISTRAL_PROVIDER_DEFINITION.adapterKey).toBe('mistral');
  });
});

describe('MISTRAL_PROVIDER_DEFINITION — defaultModelId is mistral-large-latest (Issue 6)', () => {
  it('defaultModelId is mistral-large-latest', () => {
    expect(MISTRAL_PROVIDER_DEFINITION.defaultModelId).toBe('mistral-large-latest');
  });
});

describe('MistralProvider — fetchWithTimeout classification', () => {
  const originalApiKey = process.env.MISTRAL_API_KEY;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
    process.env.MISTRAL_API_KEY = 'test-mistral-key';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalApiKey === undefined) delete process.env.MISTRAL_API_KEY;
    else process.env.MISTRAL_API_KEY = originalApiKey;
  });

  it('timeout abort is classified as request timed out, not endpoint unreachable', async () => {
    const provider = new MistralProvider(MOCK_CONFIG, { timeoutMs: 50 });
    let capturedReason: unknown;

    vi.mocked(fetch).mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        const sig = (init as RequestInit).signal;
        sig?.addEventListener('abort', () => {
          capturedReason = (sig as AbortSignal).reason;
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const promise = provider.invoke({
      role: 'cortex-chat',
      input: { prompt: 'hi' },
      traceId: TRACE_ID,
    });
    let caught: NousError | undefined;
    const settled = promise.catch((e) => { caught = e as NousError; });

    await vi.advanceTimersByTimeAsync(60);
    await settled;

    expect(caught).toBeInstanceOf(NousError);
    expect(caught?.message).toContain('Mistral request timed out after');
    expect(caught?.message).not.toContain('Mistral endpoint unreachable');
    expect(capturedReason).toBeInstanceOf(DOMException);
  });
});
