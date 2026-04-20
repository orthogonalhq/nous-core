import { describe, expect, it, vi } from 'vitest';
import { EMPTY_RESPONSE_MARKER } from '@nous/shared';
import type { IEventBus, IModelProvider } from '@nous/shared';
import { AgentGateway, deriveThinkingUnavailable } from '../../agent-gateway/agent-gateway.js';
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

// ── SP 1.17 RC-β-1.1 — recovery-propagation regression (T-G4) ──

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
 * Provider that returns a successful `invokeWithThinkingStream` response with
 * the SP 1.17 Option (iii) `recovery` field populated — simulating a
 * provider-internal recovery on the primary streaming-thinking method.
 */
function createRecoveredProvider(content: string): IModelProvider {
  return {
    invoke: vi.fn(),
    stream: vi.fn(),
    invokeWithThinkingStream: vi.fn().mockResolvedValue({
      output: { role: 'assistant', content },
      providerId: PROVIDER_ID,
      usage: { inputTokens: 5, outputTokens: 5 },
      traceId: TRACE_ID,
      recovery: {
        method: 'invoke',
        primaryError: 'PROVIDER_UNAVAILABLE',
        primaryMessage: 'Ollama request timed out after 60000ms',
      },
    }),
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

describe('AgentGateway recovery propagation regression (SP 1.17 RC-β-1.1 / T-G4)', () => {
  it('recovery-populated response renders model content unchanged; empty_response_kind not derived from recovery', async () => {
    // Build a harness with eventBus + tool-bearing turn so the canStreamThinking
    // gate fires and the dispatch ternary calls invokeWithThinkingStream directly.
    const harness = createGatewayHarness({
      modelProvider: createRecoveredProvider('Hello! How can I help you today?'),
    });
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
    // Chat-surface content equals the model's content unchanged — NO marker
    // substitution, NO empty_response_kind derived from recovery.
    expect(output.response).toBe('Hello! How can I help you today?');
    expect(output.empty_response_kind).toBeUndefined();
  });
});

// ── SP 1.17 RC-α-1 — derivation gate (T-G5–T-G8) ──

describe('deriveThinkingUnavailable derivation gate (SP 1.17 RC-α-1 / T-G5–T-G8)', () => {
  // The helper is exported from agent-gateway.ts so we can pin the structural
  // gate logic at unit-test granularity (capability + multi-turn + thinking
  // absence). Pure structural fact — no content inspection. Invariant I-3 / I-5.

  const baseValidInput = createBaseInput({ context: [] });
  const multiTurnContext = [
    { role: 'user' as const, source: 'initial_payload' as const, content: 'first', createdAt: NOW },
    { role: 'assistant' as const, source: 'model_output' as const, content: 'reply', createdAt: NOW },
  ];

  const adapterWithThinking = {
    capabilities: { extendedThinking: true, streaming: false, structuredOutput: true },
    formatRequest: () => ({ input: {} }),
    parseResponse: () => ({ response: '', toolCalls: [], thinkingContent: undefined }),
  } as unknown as Parameters<typeof deriveThinkingUnavailable>[0]['adapter'];

  const adapterWithoutThinking = {
    capabilities: { extendedThinking: false, streaming: false, structuredOutput: true },
    formatRequest: () => ({ input: {} }),
    parseResponse: () => ({ response: '', toolCalls: [], thinkingContent: undefined }),
  } as unknown as Parameters<typeof deriveThinkingUnavailable>[0]['adapter'];

  it('T-G5 — fires when capability=true AND context.length>1 AND thinkingContent absent', () => {
    const result = deriveThinkingUnavailable({
      adapter: adapterWithThinking,
      validInput: { ...baseValidInput, context: multiTurnContext },
      parsedOutput: { response: 'ok', toolCalls: [], thinkingContent: undefined } as never,
    });
    expect(result).toEqual({
      reason: 'multi-turn request shape — provider/model template does not surface thinking',
      ref: 'WR-172',
    });
  });

  it('T-G6 — does NOT fire when extendedThinking=false', () => {
    const result = deriveThinkingUnavailable({
      adapter: adapterWithoutThinking,
      validInput: { ...baseValidInput, context: multiTurnContext },
      parsedOutput: { response: 'ok', toolCalls: [], thinkingContent: undefined } as never,
    });
    expect(result).toBeUndefined();
  });

  it('T-G7 — does NOT fire when context.length<=1 (single-turn)', () => {
    const single = deriveThinkingUnavailable({
      adapter: adapterWithThinking,
      validInput: { ...baseValidInput, context: [multiTurnContext[0]] },
      parsedOutput: { response: 'ok', toolCalls: [], thinkingContent: undefined } as never,
    });
    expect(single).toBeUndefined();

    const empty = deriveThinkingUnavailable({
      adapter: adapterWithThinking,
      validInput: { ...baseValidInput, context: [] },
      parsedOutput: { response: 'ok', toolCalls: [], thinkingContent: undefined } as never,
    });
    expect(empty).toBeUndefined();
  });

  it('T-G8 — does NOT fire when thinkingContent is non-empty after trim', () => {
    const result = deriveThinkingUnavailable({
      adapter: adapterWithThinking,
      validInput: { ...baseValidInput, context: multiTurnContext },
      parsedOutput: { response: 'ok', toolCalls: [], thinkingContent: 'I am thinking.' } as never,
    });
    expect(result).toBeUndefined();
  });

  it('T-G8 — DOES fire when thinkingContent is whitespace-only (whitespace counts as empty per derivation gate)', () => {
    // SDS § 4.3 derivation gate: `tc.trim().length > 0` distinguishes empty
    // from non-empty thinking. Whitespace-only `tc` trims to '' → derivation
    // fires (the model produced a non-empty `thinkingContent` string with no
    // meaningful content, which is structurally equivalent to empty).
    const result = deriveThinkingUnavailable({
      adapter: adapterWithThinking,
      validInput: { ...baseValidInput, context: multiTurnContext },
      parsedOutput: { response: 'ok', toolCalls: [], thinkingContent: '   \n\t  ' } as never,
    });
    expect(result).toEqual({
      reason: 'multi-turn request shape — provider/model template does not surface thinking',
      ref: 'WR-172',
    });
  });
});
