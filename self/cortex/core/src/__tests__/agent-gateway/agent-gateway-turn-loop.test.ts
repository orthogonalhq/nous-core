import { describe, expect, it, vi } from 'vitest';
import { EMPTY_RESPONSE_MARKER } from '@nous/shared';
import type { IModelProvider } from '@nous/shared';
import {
  createBaseInput,
  createGatewayHarness,
  createInjectedFrame,
  createStampedPacket,
  createToolSurface,
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
