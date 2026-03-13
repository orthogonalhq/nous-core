import { describe, expect, it, vi } from 'vitest';
import { NousError } from '@nous/shared';
import { GatewayBackedTurnExecutor } from '../../gateway-runtime/index.js';

describe('GatewayBackedTurnExecutor', () => {
  it('satisfies the turn/trace seam through a gateway-backed execution path', async () => {
    const traces = new Map<string, unknown>();
    const stmEntries: Array<{ role: string; content: string; timestamp: string }> = [];
    const provider = {
      invoke: vi.fn().mockResolvedValue({
        output: JSON.stringify({
          response: 'Gateway-backed reply',
          toolCalls: [],
          memoryCandidates: [],
        }),
        providerId: '00000000-0000-0000-0000-000000000001',
        usage: {},
        traceId: '550e8400-e29b-41d4-a716-446655440199',
      }),
      stream: async function* () {},
      getConfig: () => ({
        id: '00000000-0000-0000-0000-000000000001',
        name: 'mock',
        type: 'text' as const,
        modelId: 'mock',
        isLocal: true,
        capabilities: [],
      }),
    };

    const executor = new GatewayBackedTurnExecutor({
      modelRouter: {
        routeWithEvidence: vi.fn().mockResolvedValue({
          providerId: '00000000-0000-0000-0000-000000000001',
          evidence: {},
        }),
      } as any,
      getProvider: vi.fn().mockReturnValue(provider as any),
      documentStore: {
        get: vi.fn(async (_collection: string, id: string) => traces.get(id) ?? null),
        put: vi.fn(async (_collection: string, id: string, value: unknown) => {
          traces.set(id, value);
        }),
      } as any,
      stmStore: {
        getContext: vi.fn().mockResolvedValue({ entries: [], tokenCount: 0 }),
        append: vi.fn(async (_projectId, entry) => {
          stmEntries.push(entry);
        }),
      } as any,
      mwcPipeline: {
        submit: vi.fn(),
        mutate: vi.fn().mockResolvedValue({
          applied: true,
          reason: 'ok',
          reasonCode: 'ok',
        }),
      },
    });

    const traceId = '550e8400-e29b-41d4-a716-446655440188' as import('@nous/shared').TraceId;
    const result = await executor.executeTurn({
      message: 'Hello gateway executor',
      traceId,
    });

    expect(result.response).toBe('Gateway-backed reply');
    expect(provider.invoke).toHaveBeenCalledOnce();

    const trace = await executor.getTrace(traceId);
    expect(trace?.traceId).toBe(traceId);
    expect(trace?.turns[0]?.input).toBe('Hello gateway executor');
    expect(trace?.turns[0]?.output).toBe('Gateway-backed reply');
    expect(stmEntries).toHaveLength(0);
  });

  it('maps suspended gateway results into a stable compatibility response', async () => {
    const provider = {
      invoke: vi.fn().mockRejectedValue(
        new NousError('Lane lease held.', 'LEASE_HELD', {
          laneKey: 'lane:test',
        }),
      ),
      stream: async function* () {},
      getConfig: () => ({
        id: '00000000-0000-0000-0000-000000000001',
        name: 'mock',
        type: 'text' as const,
        modelId: 'mock',
        isLocal: true,
        capabilities: [],
      }),
    };

    const executor = new GatewayBackedTurnExecutor({
      modelRouter: {
        routeWithEvidence: vi.fn().mockResolvedValue({
          providerId: '00000000-0000-0000-0000-000000000001',
          evidence: {},
        }),
      } as any,
      getProvider: vi.fn().mockReturnValue(provider as any),
      documentStore: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn(),
      } as any,
      stmStore: {
        getContext: vi.fn().mockResolvedValue({ entries: [], tokenCount: 0 }),
        append: vi.fn(),
      } as any,
      mwcPipeline: {
        submit: vi.fn(),
        mutate: vi.fn().mockResolvedValue({
          applied: true,
          reason: 'ok',
          reasonCode: 'ok',
        }),
      },
    });

    const result = await executor.executeTurn({
      message: 'Hello gateway executor',
      traceId: '550e8400-e29b-41d4-a716-446655440188' as import('@nous/shared').TraceId,
    });

    expect(result.response).toBe('[suspended: Lane lease held.]');
  });
});
