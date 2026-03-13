import { describe, expect, it } from 'vitest';
import { createBaseInput, createGatewayHarness, createStampedPacket } from './helpers.js';

describe('AgentGateway messaging', () => {
  it('returns aborted when the inbox contains an abort signal before the next model call', async () => {
    const { gateway, modelProvider } = createGatewayHarness({
      outputs: ['should not run'],
    });

    await gateway.getInboxHandle().abort('Operator requested shutdown.');
    const result = await gateway.run(createBaseInput());

    expect(result.status).toBe('aborted');
    expect(modelProvider.invoke).not.toHaveBeenCalled();
  });

  it('keeps child returns result-only when re-presented to the parent context', async () => {
    const { gateway, modelProvider } = createGatewayHarness({
      outputs: [
        JSON.stringify({
          response: 'spawn child',
          toolCalls: [
            {
              name: 'dispatch_agent',
              params: {
                targetClass: 'Worker',
                taskInstructions: 'Perform the child task.',
                budget: {
                  maxTurns: 1,
                  maxTokens: 100,
                  timeoutMs: 100,
                },
              },
            },
          ],
        }),
        JSON.stringify({
          response: 'finish',
          toolCalls: [{ name: 'task_complete', params: { output: { done: true } } }],
        }),
      ],
      lifecycleHooks: {
        dispatchAgent: async () => ({
          status: 'completed',
          output: { child: 'done' },
          v3Packet: createStampedPacket(),
          summary: 'child finished',
          artifactRefs: [],
          correlation: {
            runId: createBaseInput().correlation.runId,
            parentId: createBaseInput().correlation.parentId,
            sequence: 1,
          },
          usage: {
            turnsUsed: 1,
            tokensUsed: 20,
            elapsedMs: 40,
            spawnUnitsUsed: 0,
          },
          evidenceRefs: [],
        }),
        taskComplete: async (request) => ({
          output: request.output,
          v3Packet: createStampedPacket(),
        }),
      },
    });

    const result = await gateway.run(createBaseInput());

    expect(result.status).toBe('completed');
    const secondInvoke = modelProvider.invoke.mock.calls[1][0];
    const childFrame = (secondInvoke.input.context as Array<{ source: string; content: string }>).find(
      (frame) => frame.source === 'child_result',
    );

    expect(childFrame?.content).toContain('"child": "done"');
    expect(childFrame?.content.includes('"context"')).toBe(false);
  });
});
