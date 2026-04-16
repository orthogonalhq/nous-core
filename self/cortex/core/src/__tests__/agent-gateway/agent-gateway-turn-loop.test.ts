import { describe, expect, it } from 'vitest';
import {
  createBaseInput,
  createGatewayHarness,
  createInjectedFrame,
  createStampedPacket,
  createToolSurface,
} from './helpers.js';

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
