import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pullOllamaModel } from '../src/ollama-detection';

const originalFetch = globalThis.fetch;

function createNdjsonResponse(chunks: string[], status = 200): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/x-ndjson',
      },
    },
  );
}

describe('pullOllamaModel', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn() as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('parses NDJSON progress events and computes percentages', async () => {
    const onProgress = vi.fn();
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      createNdjsonResponse([
        '{"status":"pulling manifest"}\n',
        '{"status":"downloading","digest":"sha256:abc","total":100,"completed":25}\n',
        '{"status":"success","total":100,"completed":100}\n',
      ]),
    );

    await expect(
      pullOllamaModel('llama3.2:3b', { onProgress }),
    ).resolves.toBeUndefined();

    expect(onProgress).toHaveBeenNthCalledWith(1, {
      status: 'pulling manifest',
    });
    expect(onProgress).toHaveBeenNthCalledWith(2, {
      status: 'downloading',
      digest: 'sha256:abc',
      total: 100,
      completed: 25,
      percent: 25,
    });
    expect(onProgress).toHaveBeenNthCalledWith(3, {
      status: 'success',
      total: 100,
      completed: 100,
      percent: 100,
    });
  });

  it('keeps percent undefined when total and completed are missing', async () => {
    const onProgress = vi.fn();
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      createNdjsonResponse([
        '{"status":"pulling manifest"}\n',
        '{"status":"success"}\n',
      ]),
    );

    await pullOllamaModel('mistral:latest', { onProgress });

    expect(onProgress).toHaveBeenNthCalledWith(1, {
      status: 'pulling manifest',
    });
    expect(onProgress).toHaveBeenNthCalledWith(2, {
      status: 'success',
    });
  });

  it('throws when the stream reports an Ollama error', async () => {
    const onProgress = vi.fn();
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      createNdjsonResponse([
        '{"status":"pulling manifest"}\n',
        '{"error":"model not found"}\n',
      ]),
    );

    await expect(
      pullOllamaModel('missing:model', { onProgress }),
    ).rejects.toThrow('model not found');

    expect(onProgress).toHaveBeenLastCalledWith({
      status: 'model not found',
    });
  });

  it('throws for non-200 HTTP responses', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response('bad request', { status: 400 }),
    );

    await expect(pullOllamaModel('llama3.2:3b')).rejects.toThrow(
      'Ollama model pull failed with HTTP 400: bad request',
    );
  });

  it('throws when the stream ends without success', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      createNdjsonResponse([
        '{"status":"pulling manifest"}\n',
        '{"status":"downloading","total":100,"completed":50}\n',
      ]),
    );

    await expect(pullOllamaModel('llama3.2:3b')).rejects.toThrow(
      'ended before reporting success',
    );
  });

  it('supports aborting an in-flight stream', async () => {
    const abortController = new AbortController();
    const onProgress = vi.fn(() => {
      abortController.abort(new Error('aborted by test'));
    });

    vi.mocked(globalThis.fetch).mockImplementationOnce(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const signal = init?.signal as AbortSignal | undefined;
        const encoder = new TextEncoder();

        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                encoder.encode('{"status":"downloading","total":100,"completed":5}\n'),
              );

              const timer = setTimeout(() => {
                controller.enqueue(encoder.encode('{"status":"success"}\n'));
                controller.close();
              }, 50);

              signal?.addEventListener(
                'abort',
                () => {
                  clearTimeout(timer);
                  controller.error(signal.reason ?? new Error('aborted'));
                },
                { once: true },
              );
            },
          }),
          { status: 200 },
        );
      },
    );

    await expect(
      pullOllamaModel('llama3.2:3b', {
        signal: abortController.signal,
        onProgress,
      }),
    ).rejects.toThrow('aborted by test');
  });
});
