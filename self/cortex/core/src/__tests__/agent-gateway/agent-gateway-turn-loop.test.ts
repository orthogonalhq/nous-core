import { describe, expect, it, vi } from 'vitest';
import { EMPTY_RESPONSE_MARKER, NARRATE_WITHOUT_DISPATCH_MARKER } from '@nous/shared';
import type { IEventBus, IModelProvider, ToolDefinition } from '@nous/shared';
import { AgentGateway } from '../../agent-gateway/agent-gateway.js';
import { InMemoryGatewayOutboxSink } from '../../agent-gateway/outbox.js';
import {
  AGENT_ID,
  createBaseInput,
  createGatewayHarness,
  createInjectedFrame,
  createStampedPacket,
  createToolSurface,
  NOW,
  PROVIDER_ID,
  TRACE_ID,
} from './helpers.js';

/**
 * Build a model provider that mimics Ollama's wire shape so the gateway
 * resolves the ollama-adapter (which extracts `thinkingContent`). Used by
 * the SP 1.15 RC-1 empty-loop discriminator tests below.
 */
function createOllamaShapedProvider(messages: Array<{ content: string; thinking?: string; tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }> }>): IModelProvider {
  let i = 0;
  return {
    invoke: vi.fn().mockImplementation(async () => {
      const msg = messages[Math.min(i, messages.length - 1)];
      i += 1;
      const wireMessage: Record<string, unknown> = { role: 'assistant', content: msg.content };
      if (msg.thinking) wireMessage.thinking = msg.thinking;
      if (msg.tool_calls) wireMessage.tool_calls = msg.tool_calls;
      return {
        output: wireMessage,
        providerId: PROVIDER_ID,
        usage: { inputTokens: 5, outputTokens: 5 },
        traceId: TRACE_ID,
      };
    }),
    stream: vi.fn(),
    getConfig: vi.fn().mockReturnValue({
      id: PROVIDER_ID,
      name: 'ollama-test',
      type: 'ollama',
      vendor: 'ollama',
      modelId: 'gemma3:4b',
      isLocal: true,
      capabilities: ['reasoning'],
    }),
  };
}

describe('AgentGateway turn loop', () => {
  it('drains inbox before the next model call and emits turn acknowledgements in order', async () => {
    const { gateway, outbox, modelProvider } = createGatewayHarness({
      outputs: [
        JSON.stringify({
          response: 'turn one',
          toolCalls: [{ name: 'lookup_status', params: { step: 1 } }],
        }),
        JSON.stringify({
          response: 'turn two',
          toolCalls: [{ name: 'task_complete', params: { output: { done: true } } }],
        }),
      ],
      toolSurface: createToolSurface(async () => {
          await gateway.getInboxHandle().injectContext(
            createInjectedFrame('Supervisor updated the task constraints.'),
          );
          return {
            success: true,
            output: { ok: true },
            durationMs: 5,
          };
        }),
      lifecycleHooks: {
        taskComplete: async (request) => ({
          output: request.output,
          v3Packet: createStampedPacket(),
        }),
      },
    });

    const result = await gateway.run(createBaseInput());

    expect(result.status).toBe('completed');
    expect(outbox.events.filter((event) => event.type === 'turn_ack')).toHaveLength(2);

    const secondInvoke = modelProvider.invoke.mock.calls[1][0];
    // Text adapter produces { prompt, context } format with GatewayContextFrame[]
    const secondContext = secondInvoke.input.context as Array<{ role: string; content: string }>;
    expect(
      secondContext.some((frame) =>
        frame.content.includes('Supervisor updated the task constraints.'),
      ),
    ).toBe(true);
  });
});

describe('AgentGateway empty-loop guard (SP 1.15 RC-1)', () => {
  it('emits EMPTY_RESPONSE_MARKER + thinking_only_no_finalizer when thinking is non-empty', async () => {
    const { gateway } = createGatewayHarness({
      modelProvider: createOllamaShapedProvider([
        // Empty content + thinking present + zero tool calls — empty-loop branch fires
        { content: '', thinking: 'I considered options but did not finalize.' },
      ]),
    });

    const result = await gateway.run(createBaseInput({ budget: { maxTurns: 1, maxTokens: 200, timeoutMs: 1000 } }));

    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;
    const output = result.output as { response: string; empty_response_kind?: string; thinkingContent?: string };
    expect(output.response).toBe(EMPTY_RESPONSE_MARKER);
    expect(output.empty_response_kind).toBe('thinking_only_no_finalizer');
    expect(output.thinkingContent).toBe('I considered options but did not finalize.');
  });

  it('emits EMPTY_RESPONSE_MARKER + no_output_at_all when thinking is empty/absent', async () => {
    const { gateway } = createGatewayHarness({
      modelProvider: createOllamaShapedProvider([
        // Empty content + no thinking + zero tool calls — no_output_at_all branch
        { content: '' },
      ]),
    });

    const result = await gateway.run(createBaseInput({ budget: { maxTurns: 1, maxTokens: 200, timeoutMs: 1000 } }));

    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;
    const output = result.output as { response: string; empty_response_kind?: string };
    expect(output.response).toBe(EMPTY_RESPONSE_MARKER);
    expect(output.empty_response_kind).toBe('no_output_at_all');
  });

  it('regression — conversational exit (non-empty response, zero tool calls) leaves empty_response_kind undefined', async () => {
    const { gateway } = createGatewayHarness({
      modelProvider: createOllamaShapedProvider([
        // Non-empty content + zero tool calls — conversational-exit branch
        { content: 'A normal reply.' },
      ]),
    });

    const result = await gateway.run(createBaseInput({ budget: { maxTurns: 1, maxTokens: 200, timeoutMs: 1000 } }));

    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;
    const output = result.output as { response: string; empty_response_kind?: string };
    expect(output.response).toBe('A normal reply.');
    expect(output.empty_response_kind).toBeUndefined();
  });

  it('v3Packet.payload.data.response preserves the raw model output (empty string), not the marker', async () => {
    // Witness's view of "what the model actually emitted" must remain truthful
    // even though the user-visible output carries EMPTY_RESPONSE_MARKER.
    const { gateway } = createGatewayHarness({
      modelProvider: createOllamaShapedProvider([
        { content: '', thinking: 'reasoning' },
      ]),
    });

    const result = await gateway.run(createBaseInput({ budget: { maxTurns: 1, maxTokens: 200, timeoutMs: 1000 } }));

    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;
    const data = result.v3Packet.payload.data as { response: string };
    expect(data.response).toBe('');
    // And the user-facing output still carries the marker
    expect((result.output as { response: string }).response).toBe(EMPTY_RESPONSE_MARKER);
  });
});

// ── SP 1.16 RC-β.1 + RC-β.3 — narrate-without-dispatch detector + fromFallback ──

/**
 * Helper: build a tools array whose names produce the requested tokens of
 * length ≥ 4. Default tools include `lookup_status` (tokens `lookup`, `status`).
 */
function buildToolsWithTokens(names: string[]): ToolDefinition[] {
  return names.map((name) => ({
    name,
    version: '1.0.0',
    description: `${name} tool`,
    inputSchema: {},
    outputSchema: {},
    capabilities: ['read'],
    permissionScope: 'project',
  }));
}

describe('AgentGateway narrate-without-dispatch detector (SP 1.16 RC-β.1 / case c)', () => {
  it('classifies past-tense action narration referencing a tool token within proximity window', async () => {
    const { gateway } = createGatewayHarness({
      modelProvider: createOllamaShapedProvider([
        // Past-tense action verb (`created`) within ±120 chars of `workflow` token.
        { content: 'I created the workflow you requested.' },
      ]),
      toolSurface: createToolSurface(undefined, buildToolsWithTokens(['workflow_create'])),
    });

    const result = await gateway.run(createBaseInput({ budget: { maxTurns: 1, maxTokens: 200, timeoutMs: 1000 } }));

    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;
    const output = result.output as { response: string; empty_response_kind?: string };
    expect(output.empty_response_kind).toBe('narrate_without_dispatch');
    expect(output.response).toBe(NARRATE_WITHOUT_DISPATCH_MARKER);
  });

  it('does NOT classify present-tense statements (negative case)', async () => {
    const { gateway } = createGatewayHarness({
      modelProvider: createOllamaShapedProvider([
        { content: 'The workflow handles routing for incoming events.' },
      ]),
      toolSurface: createToolSurface(undefined, buildToolsWithTokens(['workflow_create'])),
    });

    const result = await gateway.run(createBaseInput({ budget: { maxTurns: 1, maxTokens: 200, timeoutMs: 1000 } }));

    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;
    const output = result.output as { response: string; empty_response_kind?: string };
    expect(output.empty_response_kind).toBeUndefined();
    expect(output.response).toBe('The workflow handles routing for incoming events.');
  });

  it('does NOT classify questions (negative case)', async () => {
    const { gateway } = createGatewayHarness({
      modelProvider: createOllamaShapedProvider([
        { content: 'What workflow should I create for you?' },
      ]),
      toolSurface: createToolSurface(undefined, buildToolsWithTokens(['workflow_create'])),
    });

    const result = await gateway.run(createBaseInput({ budget: { maxTurns: 1, maxTokens: 200, timeoutMs: 1000 } }));

    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;
    const output = result.output as { response: string; empty_response_kind?: string };
    expect(output.empty_response_kind).toBeUndefined();
  });

  it('does NOT classify a past-tense action when no tool token is in proximity (defensive)', async () => {
    const { gateway } = createGatewayHarness({
      modelProvider: createOllamaShapedProvider([
        // Past-tense verb but no tool token within ±120 chars.
        { content: 'I added the requested item to the list.' },
      ]),
      toolSurface: createToolSurface(undefined, buildToolsWithTokens(['unrelated_tool'])),
    });

    const result = await gateway.run(createBaseInput({ budget: { maxTurns: 1, maxTokens: 200, timeoutMs: 1000 } }));

    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;
    const output = result.output as { response: string; empty_response_kind?: string };
    expect(output.empty_response_kind).toBeUndefined();
  });

  it('does NOT classify when toolDefinitions is empty (short-circuit)', async () => {
    const { gateway } = createGatewayHarness({
      modelProvider: createOllamaShapedProvider([
        { content: 'I created the workflow you requested.' },
      ]),
      toolSurface: createToolSurface(undefined, []),
    });

    const result = await gateway.run(createBaseInput({ budget: { maxTurns: 1, maxTokens: 200, timeoutMs: 1000 } }));

    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;
    const output = result.output as { response: string; empty_response_kind?: string };
    expect(output.empty_response_kind).toBeUndefined();
  });

  it('does NOT classify when tool tokens are all length < 4 (short-circuit)', async () => {
    const { gateway } = createGatewayHarness({
      modelProvider: createOllamaShapedProvider([
        { content: 'I created the workflow you requested.' },
      ]),
      // Each token after splitting on `_` is length < 4 → toolTokens empty.
      toolSurface: createToolSurface(undefined, buildToolsWithTokens(['ab_cd_ef'])),
    });

    const result = await gateway.run(createBaseInput({ budget: { maxTurns: 1, maxTokens: 200, timeoutMs: 1000 } }));

    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;
    const output = result.output as { response: string; empty_response_kind?: string };
    expect(output.empty_response_kind).toBeUndefined();
  });

  it('SP 1.15 RC-1 case (a) precedence preserved — empty response yields SP 1.15 marker, NOT SP 1.16 marker', async () => {
    // Even when fromFallback would otherwise apply, an empty trimmed response
    // routes to case (a) per the conversational-exit branch's if/else order.
    const { gateway } = createGatewayHarness({
      modelProvider: createOllamaShapedProvider([
        { content: '' },
      ]),
      toolSurface: createToolSurface(undefined, buildToolsWithTokens(['workflow_create'])),
    });

    const result = await gateway.run(createBaseInput({ budget: { maxTurns: 1, maxTokens: 200, timeoutMs: 1000 } }));

    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;
    const output = result.output as { response: string; empty_response_kind?: string };
    expect(output.empty_response_kind).toBe('no_output_at_all');
    expect(output.response).toBe(EMPTY_RESPONSE_MARKER);
    expect(output.response).not.toBe(NARRATE_WITHOUT_DISPATCH_MARKER);
  });
});

// ── SP 1.16 RC-β.3 — fromFallback observability case (b) ──

function recordingBus(): IEventBus & { recorded: Array<{ channel: string; payload: unknown }> } {
  const recorded: Array<{ channel: string; payload: unknown }> = [];
  return {
    publish: vi.fn().mockImplementation((channel: string, payload: unknown) => {
      recorded.push({ channel, payload });
    }),
    subscribe: vi.fn().mockReturnValue('sub'),
    unsubscribe: vi.fn(),
    dispose: vi.fn(),
    recorded,
  } as unknown as IEventBus & { recorded: Array<{ channel: string; payload: unknown }> };
}

/**
 * Provider that supports `invokeWithThinkingStream` but always throws so the
 * fallback path engages, then `invoke()` returns a non-empty response with no
 * tool calls.
 */
function createFallbackThrowingProvider(content: string): IModelProvider {
  return {
    invoke: vi.fn().mockResolvedValue({
      output: { role: 'assistant', content },
      providerId: PROVIDER_ID,
      usage: { inputTokens: 5, outputTokens: 5 },
      traceId: TRACE_ID,
    }),
    stream: vi.fn(),
    invokeWithThinkingStream: vi.fn().mockRejectedValue(new Error('thinking-stream simulated failure')),
    getConfig: vi.fn().mockReturnValue({
      id: PROVIDER_ID,
      name: 'ollama-test',
      type: 'ollama',
      vendor: 'ollama',
      modelId: 'gemma3:4b',
      isLocal: true,
      capabilities: ['reasoning'],
    }),
  };
}

describe('AgentGateway fromFallback observability (SP 1.16 RC-β.3 / case b)', () => {
  it('non-empty fallback response with zero tool calls is classified narrate_without_dispatch UNCONDITIONALLY', async () => {
    // Build a harness with eventBus so canStreamThinking gate fires; provider
    // throws on invokeWithThinkingStream; fallback invoke returns a benign
    // response that the detector would NOT match — case (b) must still fire.
    const harness = createGatewayHarness({
      modelProvider: createFallbackThrowingProvider('Sure, here is some helpful information.'),
      toolSurface: createToolSurface(undefined, buildToolsWithTokens(['workflow_create'])),
    });
    // Inject eventBus into the gateway config via a fresh AgentGateway built
    // around the same harness inputs but with eventBus set.
    const eventBus = recordingBus();
    const gateway = new AgentGateway({
      agentClass: 'Worker',
      agentId: AGENT_ID,
      toolSurface: harness.toolSurface,
      modelProvider: harness.modelProvider,
      outbox: new InMemoryGatewayOutboxSink(),
      eventBus,
      now: () => NOW,
      nowMs: () => Date.parse(NOW),
      idFactory: () => AGENT_ID,
    });

    const result = await gateway.run(createBaseInput({ budget: { maxTurns: 1, maxTokens: 200, timeoutMs: 1000 } }));

    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;
    const output = result.output as { response: string; empty_response_kind?: string };
    // Detector would NOT match this content; case (b) fires regardless.
    expect(output.empty_response_kind).toBe('narrate_without_dispatch');
    expect(output.response).toBe(NARRATE_WITHOUT_DISPATCH_MARKER);
  });
});
