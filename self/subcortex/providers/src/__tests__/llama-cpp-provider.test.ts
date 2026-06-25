import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ProviderId } from '@nous/shared';
import { NousError, ValidationError } from '@nous/shared';
import { ChatCompletionsProvider } from '../protocols/openai-api/provider.js';
import { LLAMA_CPP_PROVIDER_DEFINITION } from '../providers/llama-cpp/definition.js';
import { providerFactory } from '../providers/llama-cpp/provider.js';

// Mirrors how the runtime builds a config from the definition —
// defaultEndpoint becomes config.endpoint at provider construction time.
const MOCK_CONFIG = {
  id: '00000000-0000-0000-0000-000000000099' as ProviderId,
  name: 'llama.cpp',
  type: 'text' as const,
  modelId: 'llama3.2',
  endpoint: LLAMA_CPP_PROVIDER_DEFINITION.defaultEndpoint,
  isLocal: true,
  capabilities: ['text'],
};

const TRACE_ID = '00000000-0000-0000-0000-000000000002' as any;

describe('LlamaCppProvider — definition', () => {
  it('uses local endpoint as default', () => {
    expect(LLAMA_CPP_PROVIDER_DEFINITION.defaultEndpoint).toBe('http://localhost:8080');
    expect(LLAMA_CPP_PROVIDER_DEFINITION.isLocal).toBe(true);
  });

  it('does not require auth', () => {
    expect(LLAMA_CPP_PROVIDER_DEFINITION.auth.required).toBe(false);
    expect(LLAMA_CPP_PROVIDER_DEFINITION.auth).not.toHaveProperty('envVar');
  });

  it('uses chat-completions protocol and adapter', () => {
    expect(LLAMA_CPP_PROVIDER_DEFINITION.protocol).toBe('chat-completions');
    expect(LLAMA_CPP_PROVIDER_DEFINITION.adapterKey).toBe('chat-completions');
  });

  it('does not hand-author wellKnownProviderId', () => {
    expect(LLAMA_CPP_PROVIDER_DEFINITION).not.toHaveProperty('wellKnownProviderId');
  });
});

describe('LlamaCppProvider — factory', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a ChatCompletionsProvider instance', () => {
    const provider = providerFactory.create(MOCK_CONFIG);
    expect(provider).toBeInstanceOf(ChatCompletionsProvider);
  });

  it('does not throw when no API key is provided', () => {
    expect(() => providerFactory.create(MOCK_CONFIG)).not.toThrow();
  });

  it('getConfig() returns the config passed to the factory', () => {
    const provider = providerFactory.create(MOCK_CONFIG);
    expect(provider.getConfig()).toEqual(MOCK_CONFIG);
  });

  it('invoke() validates input — rejects invalid shape with ValidationError', async () => {
    const provider = providerFactory.create(MOCK_CONFIG);

    await expect(
      provider.invoke({
        role: 'cortex-chat',
        input: { invalid: 'shape' },
        traceId: TRACE_ID,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('invoke() sends request to config.endpoint, not the OpenAI default', async () => {
    const provider = providerFactory.create(MOCK_CONFIG);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
    } as Response);

    await provider.invoke({
      role: 'cortex-chat',
      input: { prompt: 'hi' },
      traceId: TRACE_ID,
    });

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:8080/v1/chat/completions');
    expect(url).not.toContain('openai.com');
  });

  it('invoke() with valid prompt returns ModelResponse', async () => {
    const provider = providerFactory.create(MOCK_CONFIG);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Hello from llama.cpp' } }],
        usage: { prompt_tokens: 4, completion_tokens: 5 },
      }),
    } as Response);

    const result = await provider.invoke({
      role: 'cortex-chat',
      input: { prompt: 'Say hello' },
      traceId: TRACE_ID,
    });

    expect(result.output).toBe('Hello from llama.cpp');
    expect(result.providerId).toBe(MOCK_CONFIG.id);
    expect(result.usage?.inputTokens).toBe(4);
    expect(result.usage?.outputTokens).toBe(5);
  });

  it('invoke() throws PROVIDER_UNAVAILABLE on non-ok response', async () => {
    const provider = providerFactory.create(MOCK_CONFIG);
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'internal server error',
    } as Response);

    await expect(
      provider.invoke({
        role: 'cortex-chat',
        input: { prompt: 'hi' },
        traceId: TRACE_ID,
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });

  it('invoke() surfaces external abort as ABORTED', async () => {
    const provider = providerFactory.create(MOCK_CONFIG);
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

  it('stream() yields content chunks and a final done chunk', async () => {
    const provider = providerFactory.create(MOCK_CONFIG);
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(
          [
            'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}',
            '',
            'data: {"choices":[{"delta":{"content":" world"},"finish_reason":null}]}',
            '',
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":2}}',
            '',
            'data: [DONE]',
            '',
          ].join('\n'),
        ));
        controller.close();
      },
    });
    vi.mocked(fetch).mockResolvedValue(new Response(stream, { status: 200 }));

    const chunks: Array<{ content: string; done: boolean }> = [];
    for await (const chunk of provider.stream({
      role: 'cortex-chat',
      input: { prompt: 'Say hello' },
      traceId: TRACE_ID,
    })) {
      chunks.push(chunk);
    }

    expect(chunks.some((c) => c.content === 'Hello')).toBe(true);
    expect(chunks.some((c) => c.content === ' world')).toBe(true);
    expect(chunks.some((c) => c.done === true)).toBe(true);
  });
});
