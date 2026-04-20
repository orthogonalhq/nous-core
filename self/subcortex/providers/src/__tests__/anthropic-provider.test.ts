import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ProviderId } from '@nous/shared';
import { NousError, ValidationError } from '@nous/shared';
import { AnthropicProvider } from '../anthropic-provider.js';

const MOCK_CONFIG = {
  id: '00000000-0000-0000-0000-000000000101' as ProviderId,
  name: 'Anthropic',
  type: 'text' as const,
  modelId: 'claude-sonnet-4-20250514',
  endpoint: 'https://api.anthropic.com',
  isLocal: false,
  capabilities: ['chat', 'streaming'],
};

const TRACE_ID = '00000000-0000-0000-0000-000000000102' as any;

describe('AnthropicProvider', () => {
  const originalApiKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalApiKey;
    }
  });

  it('implements IModelProvider — getConfig returns config', () => {
    const provider = new AnthropicProvider(MOCK_CONFIG, {
      apiKey: 'test-anthropic-key',
    });

    expect(provider.getConfig()).toEqual(MOCK_CONFIG);
  });

  it('constructor throws PROVIDER_AUTH_FAILED when no API key is available', () => {
    delete process.env.ANTHROPIC_API_KEY;

    expect(() => new AnthropicProvider(MOCK_CONFIG)).toThrow(NousError);
  });

  it('invoke() validates input — rejects invalid with ValidationError', async () => {
    const provider = new AnthropicProvider(MOCK_CONFIG, {
      apiKey: 'test-anthropic-key',
    });

    await expect(
      provider.invoke({
        role: 'cortex-chat',
        input: {},
        traceId: TRACE_ID,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('invoke() sends Anthropic request body and headers and parses response', async () => {
    const provider = new AnthropicProvider(
      { ...MOCK_CONFIG, maxTokens: 1024 },
      { apiKey: 'test-anthropic-key' },
    );
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [{ type: 'text', text: 'Hello from Claude' }],
          usage: { input_tokens: 12, output_tokens: 7 },
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

    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(headers['x-api-key']).toBe('test-anthropic-key');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers.Authorization).toBeUndefined();
    expect(body).toEqual({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: 'Be concise.',
      messages: [
        { role: 'user', content: 'Say hello.' },
        { role: 'assistant', content: 'Previous reply.' },
      ],
      stream: false,
    });
    expect(result).toEqual({
      output: 'Hello from Claude',
      providerId: MOCK_CONFIG.id,
      usage: {
        inputTokens: 12,
        outputTokens: 7,
        computeMs: undefined,
      },
      traceId: TRACE_ID,
    });
  });

  it('invoke() converts { prompt } input to a single Anthropic user message', async () => {
    const provider = new AnthropicProvider(MOCK_CONFIG, {
      apiKey: 'test-anthropic-key',
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [{ type: 'text', text: 'Prompt response' }],
          usage: { input_tokens: 3, output_tokens: 2 },
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
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: 'Write a haiku.' }],
      stream: false,
    });
  });

  it('invoke() defaults max_tokens to 4096 when config.maxTokens is undefined', async () => {
    const provider = new AnthropicProvider(MOCK_CONFIG, {
      apiKey: 'test-anthropic-key',
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await provider.invoke({
      role: 'cortex-chat',
      input: { prompt: 'Default max tokens?' },
      traceId: TRACE_ID,
    });

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;

    expect(body.max_tokens).toBe(4096);
  });

  it('invoke() returns empty output when Anthropic content is missing', async () => {
    const provider = new AnthropicProvider(MOCK_CONFIG, {
      apiKey: 'test-anthropic-key',
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ content: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await provider.invoke({
      role: 'cortex-chat',
      input: { prompt: 'No content?' },
      traceId: TRACE_ID,
    });

    expect(result.output).toBe('');
  });

  it('invoke() throws PROVIDER_AUTH_FAILED with PRV-AUTH-FAILURE on 401', async () => {
    const provider = new AnthropicProvider(MOCK_CONFIG, {
      apiKey: 'bad-key',
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response('unauthorized', { status: 401 }),
    );

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
    const provider = new AnthropicProvider(MOCK_CONFIG, {
      apiKey: 'test-anthropic-key',
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response('rate limited', { status: 429 }),
    );

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

  it('invoke() throws PROVIDER_UNAVAILABLE with PRV-PROVIDER-UNAVAILABLE on other errors', async () => {
    const provider = new AnthropicProvider(MOCK_CONFIG, {
      apiKey: 'test-anthropic-key',
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response('server exploded', { status: 503 }),
    );

    await expect(
      provider.invoke({
        role: 'cortex-chat',
        input: { prompt: 'hi' },
        traceId: TRACE_ID,
      }),
    ).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      context: { failoverReasonCode: 'PRV-PROVIDER-UNAVAILABLE' },
    });
  });

  it('stream() parses Anthropic SSE events into chunks and usage', async () => {
    const provider = new AnthropicProvider(MOCK_CONFIG, {
      apiKey: 'test-anthropic-key',
    });
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            [
              'event: message_start',
              'data: {"type":"message_start","message":{"usage":{"input_tokens":11}}}',
              '',
              'event: content_block_delta',
              'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}',
              '',
              'event: content_block_delta',
              'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" world"}}',
              '',
              'event: message_delta',
              'data: {"type":"message_delta","usage":{"output_tokens":4}}',
              '',
            ].join('\n'),
          ),
        );
        controller.close();
      },
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(stream, { status: 200 }),
    );

    const chunks: Array<{ content: string; done: boolean; usage?: { inputTokens?: number; outputTokens?: number } }> = [];
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
      {
        content: '',
        done: true,
        usage: { inputTokens: 11, outputTokens: 4 },
      },
    ]);
  });

  it('stream() throws PROVIDER_UNAVAILABLE when response body is missing', async () => {
    const provider = new AnthropicProvider(MOCK_CONFIG, {
      apiKey: 'test-anthropic-key',
    });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body: null,
    } as Response);

    const iterator = provider.stream({
      role: 'cortex-chat',
      input: { prompt: 'hi' },
      traceId: TRACE_ID,
    });

    await expect(iterator[Symbol.asyncIterator]().next()).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      message: 'No response body',
    });
  });

  it('invoke() surfaces external abort as ABORTED', async () => {
    const provider = new AnthropicProvider(MOCK_CONFIG, {
      apiKey: 'test-anthropic-key',
    });
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      if ((init as RequestInit).signal?.aborted) {
        const error = new Error('aborted');
        error.name = 'AbortError';
        throw error;
      }

      throw new Error('expected aborted signal');
    });

    const controller = new AbortController();
    controller.abort();

    await expect(
      provider.invoke({
        role: 'cortex-chat',
        input: { prompt: 'hi' },
        traceId: TRACE_ID,
        abortSignal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'ABORTED' });
  });
});

describe('AnthropicProvider — fetchWithTimeout classification (SP 1.16 RC-β.2 / β6)', () => {
  const originalApiKey = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalApiKey;
  });

  it('timeout abort is classified as Anthropic request timed out (NOT endpoint unreachable)', async () => {
    const provider = new AnthropicProvider(MOCK_CONFIG, { timeoutMs: 50 });
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
    expect(caught?.message).toContain('Anthropic request timed out after');
    expect(caught?.message).not.toContain('Anthropic endpoint unreachable');
    expect(capturedReason).toBeInstanceOf(DOMException);
    expect((capturedReason as DOMException).name).toBe('AbortError');
  });
});
