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

  it('isolates an outbox sink failure — the turn does NOT surface as an error (OBS-002)', async () => {
    // WR-162 SP 3 — the composite `GatewayOutbox` fans sinks out via
    // `Promise.allSettled` and logs rejections instead of re-throwing them
    // (OBS-002 + OBS-005). Previously a single-sink throw surfaced as
    // `result.status === 'error'`; under the new contract sink isolation
    // preserves turn completion while the rejection is structured-logged.
    const outboxEmit = vi.fn().mockRejectedValue(new Error('outbox unavailable'));
    const { gateway } = createGatewayHarness({
      outputs: [
        JSON.stringify({
          response: 'working',
          toolCalls: [{ name: 'lookup_status', params: {} }],
        }),
      ],
      outbox: {
        events: [],
        emit: outboxEmit,
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

    // OBS-002 isolation: the throw was swallowed and logged, not propagated.
    expect(result.status).not.toBe('error');
    // The sink was still invoked (the rejection was routed through it).
    expect(outboxEmit).toHaveBeenCalled();
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
