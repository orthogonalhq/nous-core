import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProviderId } from '@nous/shared';
import { NousError, ValidationError } from '@nous/shared';
import { OllamaProvider } from '../ollama-provider.js';

const MOCK_CONFIG = {
  id: '00000000-0000-0000-0000-000000000001' as ProviderId,
  name: 'Ollama',
  type: 'text' as const,
  modelId: 'llama3.2',
  isLocal: true,
  capabilities: ['text'],
};

describe('OllamaProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('implements IModelProvider — getConfig returns config', () => {
    const provider = new OllamaProvider(MOCK_CONFIG);
    expect(provider.getConfig()).toEqual(MOCK_CONFIG);
  });

  it('invoke() validates input — rejects invalid with ValidationError', async () => {
    const provider = new OllamaProvider(MOCK_CONFIG);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ response: 'hi', done: true }),
    } as Response);

    await expect(
      provider.invoke({
        role: 'reasoner',
        input: { invalid: 'shape' },
        traceId: '00000000-0000-0000-0000-000000000002' as any,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('invoke() with valid prompt returns ModelResponse', async () => {
    const provider = new OllamaProvider(MOCK_CONFIG);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        response: 'Hello',
        done: true,
        eval_count: 2,
        prompt_eval_count: 5,
      }),
    } as Response);

    const result = await provider.invoke({
      role: 'reasoner',
      input: { prompt: 'Say hello' },
      traceId: '00000000-0000-0000-0000-000000000002' as any,
    });

    expect(result.output).toBe('Hello');
    expect(result.providerId).toBe(MOCK_CONFIG.id);
    expect(result.usage?.outputTokens).toBe(2);
    expect(result.usage?.inputTokens).toBe(5);
  });

  it('invoke() throws MODEL_NOT_FOUND on 404', async () => {
    const provider = new OllamaProvider(MOCK_CONFIG);
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'not found',
    } as Response);

    await expect(
      provider.invoke({
        role: 'reasoner',
        input: { prompt: 'hi' },
        traceId: '00000000-0000-0000-0000-000000000002' as any,
      }),
    ).rejects.toThrow(NousError);

    try {
      await provider.invoke({
        role: 'reasoner',
        input: { prompt: 'hi' },
        traceId: '00000000-0000-0000-0000-000000000002' as any,
      });
    } catch (e) {
      expect((e as NousError).code).toBe('MODEL_NOT_FOUND');
    }
  });

  it('invoke() surfaces external abort as ABORTED', async () => {
    const provider = new OllamaProvider(MOCK_CONFIG);
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
        role: 'reasoner',
        input: { prompt: 'hi' },
        traceId: '00000000-0000-0000-0000-000000000002' as any,
        abortSignal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'ABORTED' });
  });
});
