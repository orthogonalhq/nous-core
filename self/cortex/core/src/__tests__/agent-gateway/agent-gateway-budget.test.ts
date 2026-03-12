import { describe, expect, it } from 'vitest';
import { createBaseInput, createGatewayHarness } from './helpers.js';

describe('AgentGateway budgets', () => {
  it('returns budget_exhausted when max turns are reached without completion', async () => {
    const { gateway, outbox } = createGatewayHarness({
      outputs: ['still working', 'still working', 'still working'],
    });

    const result = await gateway.run(
      createBaseInput({
        budget: {
          maxTurns: 2,
          maxTokens: 400,
          timeoutMs: 1000,
        },
      }),
    );

    expect(result.status).toBe('budget_exhausted');
    if (result.status === 'budget_exhausted') {
      expect(result.exhausted).toBe('turns');
      expect(result.turnsUsed).toBe(2);
    }
    expect(outbox.events.filter((event) => event.type === 'turn_ack')).toHaveLength(2);
  });

  it('returns budget_exhausted when child dispatch exceeds the spawn ceiling', async () => {
    const { gateway } = createGatewayHarness({
      outputs: [
        JSON.stringify({
          response: 'spawn worker',
          toolCalls: [
            {
              name: 'dispatch_agent',
              params: {
                targetClass: 'Worker',
                taskInstructions: 'Analyze the payload.',
                budget: {
                  maxTurns: 10,
                  maxTokens: 5000,
                  timeoutMs: 10000,
                },
              },
            },
          ],
        }),
      ],
      lifecycleHooks: {
        dispatchAgent: async () => ({
          status: 'completed',
          output: { done: true },
          v3Packet: {
            nous: {
              v: 3,
            },
          },
          correlation: {
            runId: createBaseInput().correlation.runId,
            parentId: createBaseInput().correlation.parentId,
            sequence: 1,
          },
          usage: {
            turnsUsed: 1,
            tokensUsed: 100,
            elapsedMs: 100,
            spawnUnitsUsed: 0,
          },
          evidenceRefs: [],
        }),
      },
    });

    const result = await gateway.run(
      createBaseInput({
        spawnBudgetCeiling: 1,
      }),
    );

    expect(result.status).toBe('budget_exhausted');
    if (result.status === 'budget_exhausted') {
      expect(result.exhausted).toBe('spawn_budget');
    }
  });
});
