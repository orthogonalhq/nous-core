import { describe, expect, it, vi } from 'vitest';
import { NousError, ValidationError } from '@nous/shared';
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

  it('returns suspended when the provider lane lease is held', async () => {
    const { gateway } = createGatewayHarness({
      modelProvider: {
        invoke: vi.fn().mockRejectedValue(
          new NousError('Lane lease held.', 'LEASE_HELD', {
            laneKey: 'lane:test',
            leaseId: 'lease-1',
          }),
        ),
        stream: vi.fn(),
        getConfig: vi.fn().mockReturnValue({
          id: '550e8400-e29b-41d4-a716-446655440105',
          name: 'test-provider',
          type: 'text',
          modelId: 'test-model',
          isLocal: true,
          capabilities: ['reasoning'],
        }),
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

    expect(result.status).toBe('suspended');
    expect(result.reason).toContain('Lane lease held');
  });
});
