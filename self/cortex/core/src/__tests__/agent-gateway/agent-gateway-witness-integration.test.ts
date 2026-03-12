import { describe, expect, it } from 'vitest';
import { WitnessService } from '@nous/subcortex-witnessd';
import { createBaseInput, createDocumentStore, createGatewayHarness } from './helpers.js';

describe('AgentGateway witness integration', () => {
  it('records verifiable witness evidence for acknowledgements and terminal completion', async () => {
    const witnessService = new WitnessService(createDocumentStore());
    const { gateway } = createGatewayHarness({
      outputs: [
        JSON.stringify({
          response: 'complete task',
          toolCalls: [{ name: 'task_complete', params: { output: { done: true } } }],
        }),
      ],
      lifecycleHooks: {
        taskComplete: async (request) => ({
          output: request.output,
          v3Packet: {
            nous: {
              v: 3,
            },
          },
        }),
      },
      witnessService,
    });

    const result = await gateway.run(createBaseInput());
    const report = await witnessService.verify();

    expect(result.status).toBe('completed');
    expect(result.evidenceRefs.length).toBeGreaterThan(0);
    expect(report.status).toBe('pass');
  });
});
