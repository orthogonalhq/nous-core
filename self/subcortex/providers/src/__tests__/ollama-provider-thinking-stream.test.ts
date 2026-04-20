import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IEventBus, ProviderId } from '@nous/shared';
import { NousError } from '@nous/shared';
import { OllamaProvider } from '../ollama-provider.js';

const MOCK_CONFIG = {
  id: '00000000-0000-0000-0000-000000000001' as ProviderId,
  name: 'Ollama',
  type: 'text' as const,
  modelId: 'gemma3:4b',
  isLocal: true,
  capabilities: ['text'],
};

const TRACE_ID = '00000000-0000-0000-0000-000000000099' as never;

function recordingBus(): IEventBus & { recorded: Array<{ channel: string; payload: unknown; ts: number }> } {
  const recorded: Array<{ channel: string; payload: unknown; ts: number }> = [];
  const bus = {
    publish: vi.fn().mockImplementation((channel: string, payload: unknown) => {
      recorded.push({ channel, payload, ts: Date.now() });
    }),
    subscribe: vi.fn().mockReturnValue('sub'),
    unsubscribe: vi.fn(),
    dispose: vi.fn(),
    recorded,
  };
  return bus as unknown as IEventBus & { recorded: typeof recorded };
}

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

describe('OllamaProvider.invokeWithThinkingStream', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('returns a ModelResponse whose output preserves content + thinking + tool_calls', async () => {
    const provider = new OllamaProvider(MOCK_CONFIG);
    const bus = recordingBus();
    vi.mocked(fetch).mockResolvedValue(
      makeStreamResponse([
        JSON.stringify({
          message: { role: 'assistant', content: 'visible', thinking: 'reasoning' },
          done: false,
        }),
        JSON.stringify({
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              { function: { name: 'workflow_list', arguments: { projectId: 'p1' } } },
            ],
          },
          done: true,
          eval_count: 5,
          prompt_eval_count: 7,
        }),
      ]),
    );

    const response = await provider.invokeWithThinkingStream(
      {
        role: 'cortex-chat',
        input: { messages: [{ role: 'user', content: 'hi' }] },
        traceId: TRACE_ID,
      },
      bus,
      TRACE_ID,
    );

    const msg = response.output as {
      role?: string;
      content?: string;
      thinking?: string;
      tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
    };
    expect(msg.role).toBe('assistant');
    expect(msg.content).toBe('visible');
    expect(msg.thinking).toBe('reasoning');
    expect(msg.tool_calls?.[0].function.name).toBe('workflow_list');
    expect(response.usage?.outputTokens).toBe(5);
    expect(response.usage?.inputTokens).toBe(7);
  });

  it('publishes chat:thinking-chunk events with { content, traceId } payload as thinking arrives', async () => {
    const provider = new OllamaProvider(MOCK_CONFIG);
    const bus = recordingBus();
    vi.mocked(fetch).mockResolvedValue(
      makeStreamResponse([
        JSON.stringify({ message: { content: '', thinking: 'first' }, done: false }),
        JSON.stringify({ message: { content: '', thinking: 'second' }, done: false }),
        JSON.stringify({ message: { content: '' }, done: true, eval_count: 1, prompt_eval_count: 1 }),
      ]),
    );

    await provider.invokeWithThinkingStream(
      {
        role: 'cortex-chat',
        input: { messages: [{ role: 'user', content: 'hi' }] },
        traceId: TRACE_ID,
      },
      bus,
      TRACE_ID,
    );

    const recorded = (bus as unknown as { recorded: Array<{ channel: string; payload: unknown }> }).recorded;
    const thinkingEvents = recorded.filter((r) => r.channel === 'chat:thinking-chunk');
    expect(thinkingEvents).toHaveLength(2);
    for (const evt of thinkingEvents) {
      const payload = evt.payload as { content: string; traceId: string };
      expect(typeof payload.content).toBe('string');
      expect(payload.traceId).toBe(TRACE_ID);
    }
  });

  it('throws on fetch failure (does NOT swallow — gateway handles fallback)', async () => {
    const provider = new OllamaProvider(MOCK_CONFIG);
    const bus = recordingBus();
    vi.mocked(fetch).mockRejectedValue(new TypeError('network error'));

    await expect(
      provider.invokeWithThinkingStream(
        {
          role: 'cortex-chat',
          input: { messages: [{ role: 'user', content: 'hi' }] },
          traceId: TRACE_ID,
        },
        bus,
        TRACE_ID,
      ),
    ).rejects.toBeDefined();
  });

  it('content-only stream emits ZERO chat:thinking-chunk events (no spurious empties)', async () => {
    const provider = new OllamaProvider(MOCK_CONFIG);
    const bus = recordingBus();
    vi.mocked(fetch).mockResolvedValue(
      makeStreamResponse([
        JSON.stringify({ message: { content: 'hello' }, done: false }),
        JSON.stringify({ message: { content: ' world' }, done: false }),
        JSON.stringify({ message: { content: '' }, done: true, eval_count: 1, prompt_eval_count: 1 }),
      ]),
    );

    const response = await provider.invokeWithThinkingStream(
      {
        role: 'cortex-chat',
        input: { messages: [{ role: 'user', content: 'hi' }] },
        traceId: TRACE_ID,
      },
      bus,
      TRACE_ID,
    );

    const recorded = (bus as unknown as { recorded: Array<{ channel: string }> }).recorded;
    expect(recorded.filter((r) => r.channel === 'chat:thinking-chunk')).toHaveLength(0);
    const msg = response.output as { content?: string; thinking?: string };
    expect(msg.content).toBe('hello world');
    expect(msg.thinking).toBeUndefined();
  });

  // ── SP 1.15 RC-2 — body.stream honoring + non-streaming branch parity ──

  function makeJsonResponse(payload: unknown): Response {
    return {
      ok: true,
      status: 200,
      json: async () => payload,
    } as unknown as Response;
  }

  it('SP 1.15 RC-2 (a) — when caller passes body.stream = false, the wire body has stream: false', async () => {
    const provider = new OllamaProvider(MOCK_CONFIG);
    const bus = recordingBus();
    vi.mocked(fetch).mockResolvedValue(
      makeJsonResponse({
        message: { role: 'assistant', content: 'visible', thinking: 'reasoning' },
        done: true,
        eval_count: 5,
        prompt_eval_count: 7,
        done_reason: 'stop',
      }),
    );

    await provider.invokeWithThinkingStream(
      {
        role: 'cortex-chat',
        // The Ollama adapter sets stream: false at the outer wrapper, but
        // here we exercise the provider directly — pass `stream: false` in
        // the body shape the validator accepts.
        input: { messages: [{ role: 'user', content: 'hi' }], stream: false } as never,
        traceId: TRACE_ID,
      },
      bus,
      TRACE_ID,
    );

    const fetchCall = vi.mocked(fetch).mock.calls[0];
    const wireBody = JSON.parse((fetchCall[1] as RequestInit).body as string);
    expect(wireBody.stream).toBe(false);
  });

  it('SP 1.15 RC-2 (b) — non-streaming branch emits exactly one chat:thinking-chunk with the FULL thinking text', async () => {
    const provider = new OllamaProvider(MOCK_CONFIG);
    const bus = recordingBus();
    vi.mocked(fetch).mockResolvedValue(
      makeJsonResponse({
        message: { role: 'assistant', content: 'visible', thinking: 'full reasoning trace' },
        done: true,
        eval_count: 5,
        prompt_eval_count: 7,
      }),
    );

    await provider.invokeWithThinkingStream(
      {
        role: 'cortex-chat',
        input: { messages: [{ role: 'user', content: 'hi' }], stream: false } as never,
        traceId: TRACE_ID,
      },
      bus,
      TRACE_ID,
    );

    const recorded = (bus as unknown as { recorded: Array<{ channel: string; payload: { content: string; traceId: string } }> }).recorded;
    const thinkingEvents = recorded.filter((r) => r.channel === 'chat:thinking-chunk');
    expect(thinkingEvents).toHaveLength(1);
    expect(thinkingEvents[0].payload.content).toBe('full reasoning trace');
    expect(thinkingEvents[0].payload.traceId).toBe(TRACE_ID);
  });

  it('SP 1.15 RC-2 (c) — when body.stream is undefined the method defaults to streaming', async () => {
    const provider = new OllamaProvider(MOCK_CONFIG);
    const bus = recordingBus();
    vi.mocked(fetch).mockResolvedValue(
      makeStreamResponse([
        JSON.stringify({ message: { content: 'hi' }, done: true, eval_count: 1, prompt_eval_count: 1 }),
      ]),
    );

    await provider.invokeWithThinkingStream(
      {
        role: 'cortex-chat',
        input: { messages: [{ role: 'user', content: 'hi' }] },
        traceId: TRACE_ID,
      },
      bus,
      TRACE_ID,
    );

    const fetchCall = vi.mocked(fetch).mock.calls[0];
    const wireBody = JSON.parse((fetchCall[1] as RequestInit).body as string);
    expect(wireBody.stream).toBe(true);
  });

  it('SP 1.15 RC-2 (d) — when body.stream is explicitly true the method streams (backwards-compat)', async () => {
    const provider = new OllamaProvider(MOCK_CONFIG);
    const bus = recordingBus();
    vi.mocked(fetch).mockResolvedValue(
      makeStreamResponse([
        JSON.stringify({ message: { content: 'hi' }, done: true, eval_count: 1, prompt_eval_count: 1 }),
      ]),
    );

    await provider.invokeWithThinkingStream(
      {
        role: 'cortex-chat',
        input: { messages: [{ role: 'user', content: 'hi' }], stream: true } as never,
        traceId: TRACE_ID,
      },
      bus,
      TRACE_ID,
    );

    const fetchCall = vi.mocked(fetch).mock.calls[0];
    const wireBody = JSON.parse((fetchCall[1] as RequestInit).body as string);
    expect(wireBody.stream).toBe(true);
  });

  it('SP 1.15 RC-2 (e) — branch parity: both branches yield identical messageObj shape for equivalent upstream responses', async () => {
    const provider = new OllamaProvider(MOCK_CONFIG);

    // Streaming branch
    vi.mocked(fetch).mockReset();
    vi.mocked(fetch).mockResolvedValueOnce(
      makeStreamResponse([
        JSON.stringify({
          message: { role: 'assistant', content: 'visible', thinking: 'reasoning' },
          done: true,
          eval_count: 5,
          prompt_eval_count: 7,
        }),
      ]),
    );
    const streamingResp = await provider.invokeWithThinkingStream(
      {
        role: 'cortex-chat',
        input: { messages: [{ role: 'user', content: 'hi' }], stream: true } as never,
        traceId: TRACE_ID,
      },
      recordingBus(),
      TRACE_ID,
    );

    // Non-streaming branch with the same upstream payload shape
    vi.mocked(fetch).mockResolvedValueOnce(
      makeJsonResponse({
        message: { role: 'assistant', content: 'visible', thinking: 'reasoning' },
        done: true,
        eval_count: 5,
        prompt_eval_count: 7,
      }),
    );
    const nonStreamingResp = await provider.invokeWithThinkingStream(
      {
        role: 'cortex-chat',
        input: { messages: [{ role: 'user', content: 'hi' }], stream: false } as never,
        traceId: TRACE_ID,
      },
      recordingBus(),
      TRACE_ID,
    );

    const streamMsg = streamingResp.output as Record<string, unknown>;
    const nonStreamMsg = nonStreamingResp.output as Record<string, unknown>;
    expect(Object.keys(streamMsg).sort()).toEqual(Object.keys(nonStreamMsg).sort());
    expect(streamMsg.role).toBe(nonStreamMsg.role);
    expect(streamMsg.content).toBe(nonStreamMsg.content);
    expect(streamMsg.thinking).toBe(nonStreamMsg.thinking);
  });

  it('<think> tag SPLIT across SSE lines emits per-delta thinking events (not batched at completion)', async () => {
    const provider = new OllamaProvider(MOCK_CONFIG);
    const bus = recordingBus();
    vi.mocked(fetch).mockResolvedValue(
      makeStreamResponse([
        JSON.stringify({ message: { content: '<think>foo' }, done: false }),
        JSON.stringify({ message: { content: 'bar</think>baz' }, done: false }),
        JSON.stringify({ message: { content: '' }, done: true, eval_count: 1, prompt_eval_count: 1 }),
      ]),
    );

    await provider.invokeWithThinkingStream(
      {
        role: 'cortex-chat',
        input: { messages: [{ role: 'user', content: 'hi' }] },
        traceId: TRACE_ID,
      },
      bus,
      TRACE_ID,
    );

    const recorded = (bus as unknown as { recorded: Array<{ channel: string; payload: { content: string } }> }).recorded;
    const thinkingEvents = recorded.filter((r) => r.channel === 'chat:thinking-chunk');
    // Two non-empty thinking deltas: 'foo' (chunk 1) and 'bar' (chunk 2)
    expect(thinkingEvents.length).toBeGreaterThanOrEqual(2);
    const concatenated = thinkingEvents.map((e) => e.payload.content).join('');
    expect(concatenated).toBe('foobar');
  });
});

describe('OllamaProvider — wire-body think propagation (SP 1.16 RC-α / α6)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('wire body has think:true when input.think === true', async () => {
    const provider = new OllamaProvider(MOCK_CONFIG);
    let capturedBody: Record<string, unknown> | undefined;
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse((init as RequestInit).body as string);
      return {
        ok: true,
        json: async () => ({ message: { role: 'assistant', content: 'ok' }, done: true }),
      } as Response;
    });

    await provider.invoke({
      role: 'cortex-chat',
      input: { messages: [{ role: 'user', content: 'hi' }], stream: false, think: true },
      traceId: TRACE_ID,
    });

    expect(capturedBody?.think).toBe(true);
  });

  it('wire body omits think key when input.think is unset (backwards-compat)', async () => {
    const provider = new OllamaProvider(MOCK_CONFIG);
    let capturedBody: Record<string, unknown> | undefined;
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse((init as RequestInit).body as string);
      return {
        ok: true,
        json: async () => ({ message: { role: 'assistant', content: 'ok' }, done: true }),
      } as Response;
    });

    await provider.invoke({
      role: 'cortex-chat',
      input: { messages: [{ role: 'user', content: 'hi' }], stream: false },
      traceId: TRACE_ID,
    });

    expect(capturedBody).toBeDefined();
    expect('think' in (capturedBody ?? {})).toBe(false);
  });

  it('non-streaming branch publishes a chat:thinking-chunk with the full thinking text', async () => {
    const provider = new OllamaProvider(MOCK_CONFIG);
    const bus = recordingBus();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          role: 'assistant',
          content: 'final answer',
          thinking: 'full reasoning trace',
        },
        done: true,
      }),
    } as Response);

    await provider.invokeWithThinkingStream!(
      {
        role: 'cortex-chat',
        input: { messages: [{ role: 'user', content: 'hi' }], stream: false, think: true },
        traceId: TRACE_ID,
      },
      bus,
      TRACE_ID,
    );

    const recorded = (bus as unknown as { recorded: Array<{ channel: string; payload: { content: string } }> }).recorded;
    const thinkingEvents = recorded.filter((r) => r.channel === 'chat:thinking-chunk');
    expect(thinkingEvents.length).toBe(1);
    expect(thinkingEvents[0].payload.content).toBe('full reasoning trace');
  });
});

// ── SP 1.17 RC-β-1.1 (Option iii) — provider self-recovery contract battery ──

describe('OllamaProvider self-recovery contract (SP 1.17 RC-β-1.1 / T-P1–T-P6)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  function makeNonStreamResponse(payload: unknown): Response {
    return {
      ok: true,
      status: 200,
      json: async () => payload,
    } as unknown as Response;
  }

  function makeRequest() {
    return {
      role: 'cortex-chat' as const,
      input: {
        messages: [{ role: 'user' as const, content: 'hi' }],
        stream: false,
      },
      traceId: TRACE_ID,
    };
  }

  it('T-P1 — primary success → returned ModelResponse.recovery is undefined', async () => {
    const provider = new OllamaProvider(MOCK_CONFIG);
    const bus = recordingBus();
    vi.mocked(fetch).mockResolvedValue(
      makeNonStreamResponse({
        message: { role: 'assistant', content: 'hi back', thinking: 'thought' },
        done: true,
        eval_count: 1,
        prompt_eval_count: 1,
      }),
    );

    const result = await provider.invokeWithThinkingStream(makeRequest(), bus, TRACE_ID);
    expect(result.recovery).toBeUndefined();
  });

  /**
   * Helper to inject a primary-path failure of the desired NousError code.
   * The OllamaProvider's `fetchWithTimeout` rewraps fetch errors to
   * 'PROVIDER_UNAVAILABLE'/'ABORTED', so to test ABORTED + MODEL_NOT_FOUND
   * propagation we spy on the private `invokeWithThinkingStreamPrimary` method
   * directly (private at TS-level only — addressable at runtime).
   */
  function stubPrimary(provider: OllamaProvider, err: unknown) {
    return vi.spyOn(provider as unknown as { invokeWithThinkingStreamPrimary: (...args: unknown[]) => Promise<unknown> }, 'invokeWithThinkingStreamPrimary')
      .mockRejectedValue(err);
  }

  it('T-P2 — primary PROVIDER_UNAVAILABLE → recovery succeeds; recovery field populated; content equals invoke()-path content', async () => {
    const provider = new OllamaProvider(MOCK_CONFIG);
    const bus = recordingBus();
    // Spy on invoke to confirm it is the recovery path AND to control content.
    const invokeSpy = vi.spyOn(provider, 'invoke').mockResolvedValue({
      output: { role: 'assistant', content: 'recovered content' },
      providerId: MOCK_CONFIG.id,
      usage: { inputTokens: 1, outputTokens: 1 },
      traceId: TRACE_ID as never,
    });

    stubPrimary(provider, new NousError('Ollama request timed out after 60000ms', 'PROVIDER_UNAVAILABLE'));

    const result = await provider.invokeWithThinkingStream(makeRequest(), bus, TRACE_ID);

    expect(invokeSpy).toHaveBeenCalledTimes(1);
    expect(result.recovery).toEqual({
      method: 'invoke',
      primaryError: 'PROVIDER_UNAVAILABLE',
      primaryMessage: 'Ollama request timed out after 60000ms',
    });
    expect((result.output as { content: string }).content).toBe('recovered content');
  });

  it('T-P3 — primary ABORTED → recovery NOT attempted; ABORTED propagates', async () => {
    const provider = new OllamaProvider(MOCK_CONFIG);
    const bus = recordingBus();
    const invokeSpy = vi.spyOn(provider, 'invoke').mockResolvedValue({
      output: { role: 'assistant', content: 'should not be returned' },
      providerId: MOCK_CONFIG.id,
      usage: { inputTokens: 1, outputTokens: 1 },
      traceId: TRACE_ID as never,
    });
    stubPrimary(provider, new NousError('Ollama request aborted.', 'ABORTED'));

    await expect(provider.invokeWithThinkingStream(makeRequest(), bus, TRACE_ID)).rejects.toMatchObject({
      code: 'ABORTED',
    });
    expect(invokeSpy).not.toHaveBeenCalled();
  });

  it('T-P4 — primary MODEL_NOT_FOUND → recovery NOT attempted; MODEL_NOT_FOUND propagates', async () => {
    const provider = new OllamaProvider(MOCK_CONFIG);
    const bus = recordingBus();
    const invokeSpy = vi.spyOn(provider, 'invoke').mockResolvedValue({
      output: { role: 'assistant', content: 'should not be returned' },
      providerId: MOCK_CONFIG.id,
      usage: { inputTokens: 1, outputTokens: 1 },
      traceId: TRACE_ID as never,
    });
    stubPrimary(provider, new NousError('model not found', 'MODEL_NOT_FOUND'));

    await expect(provider.invokeWithThinkingStream(makeRequest(), bus, TRACE_ID)).rejects.toMatchObject({
      code: 'MODEL_NOT_FOUND',
    });
    expect(invokeSpy).not.toHaveBeenCalled();
  });

  it('T-P5 — primary PROVIDER_UNAVAILABLE → recovery PROVIDER_UNAVAILABLE → secondary error propagates (no composite)', async () => {
    const provider = new OllamaProvider(MOCK_CONFIG);
    const bus = recordingBus();
    const secondaryErr = new NousError('ollama down', 'PROVIDER_UNAVAILABLE');
    vi.spyOn(provider, 'invoke').mockRejectedValue(secondaryErr);
    stubPrimary(provider, new NousError('primary timeout', 'PROVIDER_UNAVAILABLE'));

    await expect(provider.invokeWithThinkingStream(makeRequest(), bus, TRACE_ID)).rejects.toBe(secondaryErr);
  });

  it('T-P6 — recovery log line emitted exactly once on recovery; NOT emitted on primary success', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const provider = new OllamaProvider(MOCK_CONFIG);
      const bus = recordingBus();

      // Primary success path
      vi.mocked(fetch).mockResolvedValueOnce(
        makeNonStreamResponse({
          message: { role: 'assistant', content: 'ok' },
          done: true,
          eval_count: 1,
          prompt_eval_count: 1,
        }),
      );
      await provider.invokeWithThinkingStream(makeRequest(), bus, TRACE_ID);

      const callsAfterSuccess = warnSpy.mock.calls.filter((c) =>
        typeof c[0] === 'string' && c[0].includes('invokeWithThinkingStream primary failed; recovering via invoke()'),
      ).length;
      expect(callsAfterSuccess).toBe(0);

      // Recovery path
      vi.spyOn(provider, 'invoke').mockResolvedValue({
        output: { role: 'assistant', content: 'recovered' },
        providerId: MOCK_CONFIG.id,
        usage: { inputTokens: 1, outputTokens: 1 },
        traceId: TRACE_ID as never,
      });
      stubPrimary(provider, new NousError('boom', 'PROVIDER_UNAVAILABLE'));
      await provider.invokeWithThinkingStream(makeRequest(), bus, TRACE_ID);

      const callsAfterRecovery = warnSpy.mock.calls.filter((c) =>
        typeof c[0] === 'string' && c[0].includes('invokeWithThinkingStream primary failed; recovering via invoke()'),
      ).length;
      expect(callsAfterRecovery).toBe(1);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
