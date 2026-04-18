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
        role: 'cortex-chat',
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
      role: 'cortex-chat',
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
        role: 'cortex-chat',
        input: { prompt: 'hi' },
        traceId: '00000000-0000-0000-0000-000000000002' as any,
        abortSignal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'ABORTED' });
  });

  // ── SP 1.13 RC-2 chunk-shape and <think> tracker regressions ────────────
  describe('stream() — SP 1.13 RC-2 chunk shape and <think> tag tracker', () => {
    function makeStreamResponse(lines: string[]): Response {
      const body = new ReadableStream({
        start(controller) {
          for (const line of lines) {
            controller.enqueue(new TextEncoder().encode(`${line}\n`));
          }
          controller.close();
        },
      });
      return { ok: true, status: 200, body } as unknown as Response;
    }

    async function collect(provider: OllamaProvider, input: { messages: Array<{ role: string; content: string }> }) {
      const chunks: Array<{ content: string; thinking?: string; done: boolean }> = [];
      for await (const chunk of provider.stream({
        role: 'cortex-chat',
        input,
        traceId: '00000000-0000-0000-0000-000000000099' as any,
      })) {
        chunks.push({ content: chunk.content, thinking: chunk.thinking, done: chunk.done });
      }
      return chunks;
    }

    it('case 1: native data.message.thinking populates chunk.thinking', async () => {
      const provider = new OllamaProvider(MOCK_CONFIG);
      vi.mocked(fetch).mockResolvedValue(
        makeStreamResponse([
          JSON.stringify({ message: { content: 'visible text', thinking: 'reasoning text' }, done: false }),
          JSON.stringify({ message: { content: '' }, done: true, eval_count: 1, prompt_eval_count: 2 }),
        ]),
      );

      const chunks = await collect(provider, { messages: [{ role: 'user', content: 'hi' }] });
      expect(chunks[0].content).toBe('visible text');
      expect(chunks[0].thinking).toBe('reasoning text');
    });

    it('case 2: <think>foo</think>bar in single chunk → thinking=foo, content=bar', async () => {
      const provider = new OllamaProvider(MOCK_CONFIG);
      vi.mocked(fetch).mockResolvedValue(
        makeStreamResponse([
          JSON.stringify({ message: { content: '<think>foo</think>bar' }, done: false }),
          JSON.stringify({ message: { content: '' }, done: true }),
        ]),
      );

      const chunks = await collect(provider, { messages: [{ role: 'user', content: 'hi' }] });
      expect(chunks[0].thinking).toBe('foo');
      expect(chunks[0].content).toBe('bar');
    });

    it('case 3: <think> tag SPLIT across chunks correctly extracts thinking', async () => {
      const provider = new OllamaProvider(MOCK_CONFIG);
      vi.mocked(fetch).mockResolvedValue(
        makeStreamResponse([
          JSON.stringify({ message: { content: '<think>foo' }, done: false }),
          JSON.stringify({ message: { content: 'bar</think>baz' }, done: false }),
          JSON.stringify({ message: { content: '' }, done: true }),
        ]),
      );

      const chunks = await collect(provider, { messages: [{ role: 'user', content: 'hi' }] });
      // chunk N: enters <think>, captures 'foo' as thinking
      expect(chunks[0].thinking).toBe('foo');
      expect(chunks[0].content).toBe('');
      // chunk N+1: 'bar' before </think>, then 'baz' after
      expect(chunks[1].thinking).toBe('bar');
      expect(chunks[1].content).toBe('baz');
    });

    it('case 4: partial <thi tag prefix at end of chunk N is buffered, no false content emission', async () => {
      const provider = new OllamaProvider(MOCK_CONFIG);
      vi.mocked(fetch).mockResolvedValue(
        makeStreamResponse([
          JSON.stringify({ message: { content: '<thi' }, done: false }),
          JSON.stringify({ message: { content: 'nk>foo</think>bar' }, done: false }),
          JSON.stringify({ message: { content: '' }, done: true }),
        ]),
      );

      const chunks = await collect(provider, { messages: [{ role: 'user', content: 'hi' }] });
      // chunk N: '<thi' is partial-tag prefix → buffered, no content emitted
      expect(chunks[0].content).toBe('');
      expect(chunks[0].thinking).toBeUndefined();
      // chunk N+1: tracker resolves the tag, captures 'foo' as thinking, 'bar' as content
      expect(chunks[1].thinking).toBe('foo');
      expect(chunks[1].content).toBe('bar');
    });

    it('case 5: two back-to-back stream() calls do NOT share <think> tracker state', async () => {
      const provider = new OllamaProvider(MOCK_CONFIG);

      // First call: ends mid-<think> block (no closing tag → tracker leaves state insideThink=true at end)
      vi.mocked(fetch).mockResolvedValueOnce(
        makeStreamResponse([
          JSON.stringify({ message: { content: '<think>incomplete' }, done: false }),
          JSON.stringify({ message: { content: '' }, done: true }),
        ]),
      );
      await collect(provider, { messages: [{ role: 'user', content: 'first' }] });

      // Second call: plain text, NO tags. If state leaked, the tracker would route
      // 'plain text' into thinking. With per-stream-call state (Invariant I-4),
      // 'plain text' goes to content as expected.
      vi.mocked(fetch).mockResolvedValueOnce(
        makeStreamResponse([
          JSON.stringify({ message: { content: 'plain text' }, done: false }),
          JSON.stringify({ message: { content: '' }, done: true }),
        ]),
      );
      const secondChunks = await collect(provider, { messages: [{ role: 'user', content: 'second' }] });
      expect(secondChunks[0].content).toBe('plain text');
      expect(secondChunks[0].thinking).toBeUndefined();
    });

    it('case 6: data.done with non-empty pendingPrefix flushes partial as literal to current stream', async () => {
      const provider = new OllamaProvider(MOCK_CONFIG);
      vi.mocked(fetch).mockResolvedValue(
        makeStreamResponse([
          // Pending prefix '<thi' at end of stream — flushed as literal to content
          // (insideThink is still false because we never crossed the open tag).
          JSON.stringify({ message: { content: 'hello<thi' }, done: true, eval_count: 1, prompt_eval_count: 2 }),
        ]),
      );

      const chunks = await collect(provider, { messages: [{ role: 'user', content: 'hi' }] });
      // 'hello' is content; '<thi' partial flushed to content because insideThink=false at done.
      expect(chunks[0].content).toBe('hello<thi');
      expect(chunks[0].thinking).toBeUndefined();
    });
  });
});
