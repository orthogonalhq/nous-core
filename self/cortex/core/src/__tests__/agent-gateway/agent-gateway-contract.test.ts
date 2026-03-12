import { describe, expect, it } from 'vitest';
import { AgentResultSchema } from '@nous/shared';
import { createBaseInput, createGatewayHarness } from './helpers.js';

describe('AgentGateway contract', () => {
  it('emits a valid completed result through the shared union', async () => {
    const { gateway } = createGatewayHarness({
      outputs: [
        JSON.stringify({
          response: 'task completed',
          toolCalls: [
            {
              name: 'task_complete',
              params: {
                output: {
                  ready: true,
                },
                summary: 'Worker finished',
              },
            },
          ],
        }),
      ],
      lifecycleHooks: {
        taskComplete: async (request) => ({
          output: request.output,
          summary: request.summary,
          artifactRefs: ['artifact-1'],
          v3Packet: {
            nous: {
              v: 3,
            },
          },
        }),
      },
    });

    const result = await gateway.run(createBaseInput());

    expect(result.status).toBe('completed');
    expect(AgentResultSchema.safeParse(result).success).toBe(true);
  });
});
