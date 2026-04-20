import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ProviderId } from '@nous/shared';
import { NousError, ValidationError } from '@nous/shared';
import { OpenAiCompatibleProvider } from '../openai-provider.js';

const MOCK_CONFIG = {
  id: '00000000-0000-0000-0000-000000000001' as ProviderId,
  name: 'OpenAI',
  type: 'text' as const,
  modelId: 'gpt-4o-mini',
  isLocal: false,
  capabilities: ['text'],
};

describe('OpenAiCompatibleProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('process', {
      ...process,
      env: { ...process.env, OPENAI_API_KEY: 'test-key' },
    });
  });

  it('implements IModelProvider — getConfig returns config', () => {
    const provider = new OpenAiCompatibleProvider(MOCK_CONFIG, {
      apiKey: 'test-key',
    });
    expect(provider.getConfig()).toEqual(MOCK_CONFIG);
  });

  it('constructor throws when no API key', () => {
    const orig = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    expect(
      () =>
        new OpenAiCompatibleProvider(MOCK_CONFIG),
    ).toThrow(NousError);
    process.env.OPENAI_API_KEY = orig;
  });

  it('invoke() validates input — rejects invalid with ValidationError', async () => {
    const provider = new OpenAiCompatibleProvider(MOCK_CONFIG, {
      apiKey: 'test-key',
    });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
    } as Response);

    await expect(
      provider.invoke({
        role: 'cortex-chat',
        input: {},
        traceId: '00000000-0000-0000-0000-000000000002' as any,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('invoke() with valid prompt returns ModelResponse', async () => {
    const provider = new OpenAiCompatibleProvider(MOCK_CONFIG, {
      apiKey: 'test-key',
    });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Hello' } }],
        usage: { prompt_tokens: 5, completion_tokens: 2 },
      }),
    } as Response);

    const result = await provider.invoke({
      role: 'cortex-chat',
      input: { prompt: 'Say hello' },
      traceId: '00000000-0000-0000-0000-000000000002' as any,
    });

    expect(result.output).toBe('Hello');
    expect(result.providerId).toBe(MOCK_CONFIG.id);
    expect(result.usage?.inputTokens).toBe(5);
    expect(result.usage?.outputTokens).toBe(2);
  });

  it('invoke() throws PROVIDER_AUTH_FAILED on 401', async () => {
    const provider = new OpenAiCompatibleProvider(MOCK_CONFIG, {
      apiKey: 'bad-key',
    });
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'unauthorized',
    } as Response);

    await expect(
      provider.invoke({
        role: 'cortex-chat',
        input: { prompt: 'hi' },
        traceId: '00000000-0000-0000-0000-000000000002' as any,
      }),
    ).rejects.toThrow(NousError);

    try {
      await provider.invoke({
        role: 'cortex-chat',
        input: { prompt: 'hi' },
        traceId: '00000000-0000-0000-0000-000000000002' as any,
      });
    } catch (e) {
      expect((e as NousError).code).toBe('PROVIDER_AUTH_FAILED');
    }
  });

  it('invoke() surfaces external abort as ABORTED', async () => {
    const provider = new OpenAiCompatibleProvider(MOCK_CONFIG, {
      apiKey: 'test-key',
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
        traceId: '00000000-0000-0000-0000-000000000002' as any,
        abortSignal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'ABORTED' });
  });
});

describe('OpenAiCompatibleProvider — fetchWithTimeout classification (SP 1.16 RC-β.2 / β6)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('process', {
      ...process,
      env: { ...process.env, OPENAI_API_KEY: 'test-key' },
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('timeout abort is classified as OpenAI request timed out (NOT endpoint unreachable)', async () => {
    const provider = new OpenAiCompatibleProvider(
      MOCK_CONFIG,
      { apiKey: 'test-key', timeoutMs: 50 },
    );
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
      traceId: '00000000-0000-0000-0000-000000000002' as any,
    });
    let caught: NousError | undefined;
    const settled = promise.catch((e) => { caught = e as NousError; });

    await vi.advanceTimersByTimeAsync(60);
    await settled;
    expect(caught).toBeInstanceOf(NousError);
    expect(caught?.message).toContain('OpenAI request timed out after');
    expect(caught?.message).not.toContain('OpenAI endpoint unreachable');
    expect(capturedReason).toBeInstanceOf(DOMException);
    expect((capturedReason as DOMException).name).toBe('AbortError');
  });
});
