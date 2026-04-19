/**
 * Tier 2 integration tests for the SP 1.13 RC-2 dispatch decision split:
 *  - canStreamContent retains the cycle-1 SP 1.9 RC-2 invariant
 *    (`tools.length === 0` clause). Tool-bearing turns NEVER take the
 *    content-streaming path.
 *  - canStreamThinking gates on extendedThinking + provider exposing
 *    `invokeWithThinkingStream`. Tool-bearing turns CAN take this path
 *    because thinking content does not interfere with tool_calls extraction.
 *  - The wrapper getter pattern preserves the typeof capability check
 *    across `LaneAwareProvider`/`ObservableProvider` (Invariant I-9).
 *  - The fallback path (provider.invoke()) fires whenever
 *    invokeWithThinkingStream throws or is absent.
 */
import { describe, expect, it, vi } from 'vitest';
import type {
  AgentGatewayConfig,
  IEventBus,
  IModelProvider,
  IScopedMcpToolSurface,
  ModelRequest,
  ModelResponse,
  ToolDefinition,
} from '@nous/shared';
import { AgentGateway } from '../../agent-gateway/agent-gateway.js';
import {
  AGENT_ID,
  NOW,
  PROVIDER_ID,
  TRACE_ID,
  createBaseInput,
  createStampedPacket,
  InMemoryGatewayOutboxSink,
} from './helpers.js';

function makeOllamaConfig(): ReturnType<IModelProvider['getConfig']> {
  return {
    id: PROVIDER_ID,
    name: 'ollama-local',
    type: 'ollama',
    vendor: 'ollama',
    modelId: 'gemma3:4b',
    isLocal: true,
    capabilities: ['reasoning'],
  } as ReturnType<IModelProvider['getConfig']>;
}

function makeMessageOutput(toolName: string | null) {
  // Ollama-shaped message that the ollama adapter's parseResponse can read.
  const message: Record<string, unknown> = {
    role: 'assistant',
    content: '',
  };
  if (toolName) {
    message.tool_calls = [
      {
        function: {
          name: toolName,
          arguments: { ok: true },
        },
      },
    ];
  }
  return message;
}

function makeProvider(overrides: {
  invoke?: IModelProvider['invoke'];
  stream?: IModelProvider['stream'];
  invokeWithThinkingStream?: IModelProvider['invokeWithThinkingStream'];
}): IModelProvider {
  return {
    getConfig: () => makeOllamaConfig(),
    invoke: overrides.invoke ?? vi.fn().mockResolvedValue({
      output: makeMessageOutput(null),
      providerId: PROVIDER_ID,
      usage: { inputTokens: 1, outputTokens: 1 },
      traceId: TRACE_ID,
    } satisfies ModelResponse),
    stream: overrides.stream ?? vi.fn(),
    ...(overrides.invokeWithThinkingStream
      ? { invokeWithThinkingStream: overrides.invokeWithThinkingStream }
      : {}),
  };
}

function recordingEventBus(): IEventBus & { recorded: Array<{ channel: string; payload: unknown; ts: number }> } {
  const recorded: Array<{ channel: string; payload: unknown; ts: number }> = [];
  const bus = {
    publish: vi.fn().mockImplementation((channel: string, payload: unknown) => {
      recorded.push({ channel, payload, ts: Date.now() });
    }),
    subscribe: vi.fn().mockReturnValue('sub-1'),
    unsubscribe: vi.fn(),
    dispose: vi.fn(),
  };
  (bus as { recorded: typeof recorded }).recorded = recorded;
  return bus as never;
}

const TOOL_DEFS: ToolDefinition[] = [
  {
    name: 'workflow_list',
    version: '1.0.0',
    description: 'list workflows',
    inputSchema: {},
    outputSchema: {},
    capabilities: ['read'],
    permissionScope: 'project',
    isConcurrencySafe: true,
  },
];

function createGateway(args: {
  provider: IModelProvider;
  eventBus?: IEventBus;
  toolSurface?: IScopedMcpToolSurface;
}): { gateway: AgentGateway; outbox: InMemoryGatewayOutboxSink } {
  const outbox = new InMemoryGatewayOutboxSink();
  const toolSurface = args.toolSurface ?? {
    listTools: vi.fn().mockResolvedValue(TOOL_DEFS),
    executeTool: vi.fn().mockResolvedValue({ success: true, output: { ok: true }, durationMs: 1 }),
  };
  const gateway = new AgentGateway({
    agentClass: 'Cortex::Principal',
    agentId: AGENT_ID,
    toolSurface,
    modelProvider: args.provider,
    eventBus: args.eventBus,
    outbox,
    now: () => NOW,
    nowMs: () => Date.parse(NOW),
    idFactory: () => AGENT_ID,
    lifecycleHooks: {
      taskComplete: async (request) => ({
        output: request.output,
        v3Packet: createStampedPacket(),
      }),
    },
  } as AgentGatewayConfig);
  return { gateway, outbox };
}

describe('AgentGateway SP 1.13 RC-2 thinking-stream dispatch', () => {
  it('Scenario A — canStreamContent === false whenever tools.length > 0 (cycle-1 RC-2 protection)', async () => {
    // Provider exposes both stream() and (intentionally) NO invokeWithThinkingStream
    // so the only way streaming would happen is via stream() — which must NOT fire.
    const streamSpy = vi.fn();
    const invokeSpy = vi.fn().mockResolvedValue({
      output: makeMessageOutput('task_complete'),
      providerId: PROVIDER_ID,
      usage: { inputTokens: 1, outputTokens: 1 },
      traceId: TRACE_ID,
    });
    const provider = makeProvider({ stream: streamSpy, invoke: invokeSpy });
    const eventBus = recordingEventBus();

    const { gateway } = createGateway({ provider, eventBus });
    await gateway.run(createBaseInput());

    // Even though we provided eventBus, an ollama adapter (streaming: true,
    // extendedThinking: true), and the provider has stream(), tools.length > 0
    // disables canStreamContent. With invokeWithThinkingStream absent,
    // canStreamThinking is also false → falls through to provider.invoke.
    expect(streamSpy).not.toHaveBeenCalled();
    expect(invokeSpy).toHaveBeenCalled();
  });

  it('Scenario B — invokeWithThinkingStream fires for tool-bearing turn when provider exposes it', async () => {
    const itsSpy = vi.fn().mockImplementation(async (_req, eventBus, traceId) => {
      // Emit a thinking chunk before resolving so we can assert ordering.
      eventBus.publish('chat:thinking-chunk', { content: 'reasoning...', traceId });
      return {
        output: makeMessageOutput('task_complete'),
        providerId: PROVIDER_ID,
        usage: { inputTokens: 1, outputTokens: 1 },
        traceId,
      } satisfies ModelResponse;
    });
    const invokeSpy = vi.fn();
    const streamSpy = vi.fn();
    const provider = makeProvider({
      invoke: invokeSpy,
      stream: streamSpy,
      invokeWithThinkingStream: itsSpy,
    });
    const eventBus = recordingEventBus();

    const { gateway } = createGateway({ provider, eventBus });
    await gateway.run(createBaseInput());

    expect(itsSpy).toHaveBeenCalled();
    expect(invokeSpy).not.toHaveBeenCalled();
    expect(streamSpy).not.toHaveBeenCalled();
  });

  it('Scenario C — wrapper-hidden invokeWithThinkingStream → typeof falsy → falls back to invoke()', async () => {
    // Construct a provider object whose `invokeWithThinkingStream` getter returns undefined
    // (mirroring LaneAwareProvider/ObservableProvider behavior when the inner provider
    // lacks the method).
    const invokeSpy = vi.fn().mockResolvedValue({
      output: makeMessageOutput('task_complete'),
      providerId: PROVIDER_ID,
      usage: { inputTokens: 1, outputTokens: 1 },
      traceId: TRACE_ID,
    } satisfies ModelResponse);
    const streamSpy = vi.fn();
    const provider: IModelProvider = {
      getConfig: () => makeOllamaConfig(),
      invoke: invokeSpy,
      stream: streamSpy,
      // simulate getter returning undefined
      get invokeWithThinkingStream() {
        return undefined;
      },
    };
    const eventBus = recordingEventBus();

    const { gateway } = createGateway({ provider, eventBus });
    await gateway.run(createBaseInput());

    // typeof undefined !== 'function' → canStreamThinking === false
    expect(invokeSpy).toHaveBeenCalled();
    expect(streamSpy).not.toHaveBeenCalled();
  });

  it('Scenario D — invokeWithThinkingStream throws → catch logs warn and falls back to provider.invoke()', async () => {
    const itsSpy = vi.fn().mockRejectedValue(new Error('stream fetch broke'));
    const invokeSpy = vi.fn().mockResolvedValue({
      output: makeMessageOutput('task_complete'),
      providerId: PROVIDER_ID,
      usage: { inputTokens: 1, outputTokens: 1 },
      traceId: TRACE_ID,
    } satisfies ModelResponse);
    const provider = makeProvider({
      invoke: invokeSpy,
      invokeWithThinkingStream: itsSpy,
    });
    const eventBus = recordingEventBus();

    const { gateway } = createGateway({ provider, eventBus });
    await gateway.run(createBaseInput());

    expect(itsSpy).toHaveBeenCalled();
    expect(invokeSpy).toHaveBeenCalled(); // fallback path invoked
  });

  it('SP 1.15 RC-2 (Tier 3) — production wrap chain end-to-end: real OllamaProvider + LaneAwareProvider + ObservableProvider drives non-streaming branch on tool-bearing turn', async () => {
    // Tier 3 production wrap chain test — addresses RCM Observation O-3
    // (SP 1.13 Tier 4 test gap). Mocks the fetch boundary only; uses real
    // OllamaProvider, real LaneAwareProvider, real ObservableProvider, and a
    // real AgentGateway with the ollama adapter.
    const { OllamaProvider, LaneAwareProvider, ObservableProvider, InferenceLane } = await import('@nous/subcortex-providers');

    // Mock fetch to return a non-streaming Ollama /api/chat response
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        message: {
          role: 'assistant',
          content: '',
          thinking: 'I need to look up workflows.',
          tool_calls: [
            {
              function: { name: 'task_complete', arguments: { output: { ok: true } } },
            },
          ],
        },
        done: true,
        done_reason: 'stop',
        eval_count: 12,
        prompt_eval_count: 14,
      }),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchSpy);

    try {
      const baseProvider = new OllamaProvider({
        id: PROVIDER_ID,
        name: 'ollama-local',
        type: 'ollama',
        vendor: 'ollama',
        modelId: 'gemma3:4b',
        isLocal: true,
        capabilities: ['reasoning'],
      } as never);
      const lane = new InferenceLane('lane:ollama:test');
      const laneWrapped = new LaneAwareProvider(baseProvider, lane);
      const eventBus = recordingEventBus();
      const observable = new ObservableProvider(laneWrapped, eventBus, {
        providerId: PROVIDER_ID,
        modelId: 'gemma3:4b',
        laneKey: 'lane:ollama:test',
      });

      const { gateway } = createGateway({ provider: observable, eventBus });
      const result = await gateway.run(createBaseInput());

      // 1. Wire body: stream:false (the adapter set it because tools are present)
      expect(fetchSpy).toHaveBeenCalled();
      const fetchInit = fetchSpy.mock.calls[0][1] as RequestInit;
      const wireBody = JSON.parse(fetchInit.body as string);
      expect(wireBody.stream).toBe(false);

      // 2. Exactly one chat:thinking-chunk event published (non-streaming branch)
      const recorded = (eventBus as unknown as { recorded: Array<{ channel: string; payload: { content: string } }> }).recorded;
      const thinkingEvents = recorded.filter((r) => r.channel === 'chat:thinking-chunk');
      expect(thinkingEvents).toHaveLength(1);
      expect(thinkingEvents[0].payload.content).toBe('I need to look up workflows.');

      // 3. Result completed (the tool_call drove the gateway to terminal completion)
      expect(result.status).toBe('completed');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('Scenario E — chat:thinking-chunk events are recorded BEFORE invokeWithThinkingStream resolves', async () => {
    const eventBus = recordingEventBus();

    let publishedDuringCall = false;
    const itsSpy = vi.fn().mockImplementation(async (_req: ModelRequest, ebus: IEventBus, traceId: string) => {
      // Publish a thinking chunk BEFORE returning — then read the recorded array
      // to assert the publish is observable to the caller before the awaited result.
      ebus.publish('chat:thinking-chunk', { content: 'first thought', traceId });
      publishedDuringCall =
        (eventBus as unknown as { recorded: unknown[] }).recorded.some(
          (r: unknown) => (r as { channel: string }).channel === 'chat:thinking-chunk',
        );
      return {
        output: makeMessageOutput('task_complete'),
        providerId: PROVIDER_ID,
        usage: { inputTokens: 1, outputTokens: 1 },
        traceId,
      } satisfies ModelResponse;
    });
    const provider = makeProvider({ invokeWithThinkingStream: itsSpy });

    const { gateway } = createGateway({ provider, eventBus });
    await gateway.run(createBaseInput());

    expect(publishedDuringCall).toBe(true);
    const recorded = (eventBus as unknown as { recorded: Array<{ channel: string }> }).recorded;
    expect(recorded.some((r) => r.channel === 'chat:thinking-chunk')).toBe(true);
  });
});
