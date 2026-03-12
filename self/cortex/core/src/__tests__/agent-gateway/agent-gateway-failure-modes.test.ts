import { describe, expect, it, vi } from 'vitest';
import { ValidationError } from '@nous/shared';
import { createBaseInput, createGatewayHarness } from './helpers.js';

describe('AgentGateway failure modes', () => {
  it('throws ValidationError for malformed agent input', async () => {
    const { gateway } = createGatewayHarness({
      outputs: [],
    });

    await expect(
      gateway.run({
        taskInstructions: '',
      } as never),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('returns error when the outbox sink fails during turn acknowledgement', async () => {
    const { gateway } = createGatewayHarness({
      outputs: ['plain response'],
      outbox: {
        events: [],
        emit: vi.fn().mockRejectedValue(new Error('outbox unavailable')),
      } as never,
    });

    const result = await gateway.run(
      createBaseInput({
        budget: {
          maxTurns: 1,
          maxTokens: 200,
          timeoutMs: 1000,
        },
      }),
    );

    expect(result.status).toBe('error');
  });
});
