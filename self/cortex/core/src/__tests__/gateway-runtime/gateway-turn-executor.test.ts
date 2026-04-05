import { describe, expect, it, vi } from 'vitest';
import { NousError } from '@nous/shared';
import { GatewayBackedTurnExecutor } from '../../gateway-runtime/index.js';
import { transformGatewayInput } from '../../gateway-runtime/gateway-turn-executor.js';
import { TextModelInputSchema } from '../../../../../subcortex/providers/src/schemas.js';

describe('GatewayBackedTurnExecutor', () => {
  it('transforms gateway-format input into provider-compatible messages', () => {
    const transformed = transformGatewayInput({
      systemPrompt: 'Follow the system instructions',
      context: [
        {
          role: 'user',
          source: 'initial_context',
          content: 'First question',
          createdAt: '2026-03-21T23:00:00.000Z',
        },
        {
          role: 'assistant',
          source: 'model_output',
          content: 'First answer',
          createdAt: '2026-03-21T23:00:01.000Z',
        },
        {
          role: 'tool',
          source: 'tool_result',
          content: 'tool output',
          createdAt: '2026-03-21T23:00:02.000Z',
        },
      ],
      tools: [{ name: 'task_complete' }],
    });

    expect(transformed).toEqual({
      messages: [
        { role: 'system', content: 'Follow the system instructions' },
        { role: 'user', content: 'First question' },
        { role: 'assistant', content: 'First answer' },
        { role: 'user', content: 'tool output' },
      ],
    });
    expect(TextModelInputSchema.safeParse(transformed).success).toBe(true);
    expect(transformed).not.toHaveProperty('tools');
  });

  it('passes through existing provider input shapes unchanged', () => {
    const promptInput = { prompt: 'Summarize this' };
    const messagesInput = {
      messages: [{ role: 'user', content: 'Already in provider format' }],
    };
    const randomInput = { foo: 'bar' };

    expect(transformGatewayInput(promptInput)).toBe(promptInput);
    expect(transformGatewayInput(messagesInput)).toBe(messagesInput);
    expect(transformGatewayInput(randomInput)).toBe(randomInput);
  });

  it('keeps empty system prompts and empty context arrays valid', () => {
    const transformed = transformGatewayInput({
      systemPrompt: '',
      context: [],
      tools: [],
    });

    expect(transformed).toEqual({
      messages: [{ role: 'system', content: '' }],
    });
    expect(TextModelInputSchema.safeParse(transformed).success).toBe(true);
  });

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
    expect(provider.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          messages: [
            expect.objectContaining({
              role: 'system',
            }),
            expect.objectContaining({
              role: 'user',
              content: '{\n  "message": "Hello gateway executor"\n}',
            }),
          ],
        },
      }),
    );

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

  it('propagates contentType through the pipeline for OpenUI-prefixed output', async () => {
    const stmEntries: Array<{ role: string; content: string; timestamp: string; metadata?: Record<string, unknown> }> = [];
    const provider = {
      invoke: vi.fn().mockResolvedValue({
        output: JSON.stringify({
          response: '%%openui\n<StatusCard title="Test" status="active" description="Hi" />',
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
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn(),
      } as any,
      stmStore: {
        getContext: vi.fn().mockResolvedValue({ entries: [], tokenCount: 0 }),
        append: vi.fn(async (_projectId, entry) => {
          stmEntries.push(entry);
        }),
      } as any,
      mwcPipeline: {
        submit: vi.fn(),
        mutate: vi.fn().mockResolvedValue({ applied: true, reason: 'ok', reasonCode: 'ok' }),
      },
    });

    const result = await executor.executeTurn({
      message: 'Show status',
      projectId: '00000000-0000-0000-0000-000000000099' as import('@nous/shared').ProjectId,
      traceId: '550e8400-e29b-41d4-a716-446655440188' as import('@nous/shared').TraceId,
    });

    // contentType should be propagated in the return value
    expect(result.contentType).toBe('openui');
    // Prefix should be stripped from response
    expect(result.response).toBe('<StatusCard title="Test" status="active" description="Hi" />');
    expect(result.response).not.toContain('%%openui');

    // STM assistant entry should have contentType in metadata
    const assistantEntry = stmEntries.find(e => e.role === 'assistant');
    expect(assistantEntry).toBeDefined();
    expect(assistantEntry?.metadata).toEqual({ contentType: 'openui' });
    expect(assistantEntry?.content).not.toContain('%%openui');
  });

  it('does not include contentType metadata for plain text output', async () => {
    const stmEntries: Array<{ role: string; content: string; timestamp: string; metadata?: Record<string, unknown> }> = [];
    const provider = {
      invoke: vi.fn().mockResolvedValue({
        output: JSON.stringify({
          response: 'Just a normal reply',
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
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn(),
      } as any,
      stmStore: {
        getContext: vi.fn().mockResolvedValue({ entries: [], tokenCount: 0 }),
        append: vi.fn(async (_projectId, entry) => {
          stmEntries.push(entry);
        }),
      } as any,
      mwcPipeline: {
        submit: vi.fn(),
        mutate: vi.fn().mockResolvedValue({ applied: true, reason: 'ok', reasonCode: 'ok' }),
      },
    });

    const result = await executor.executeTurn({
      message: 'Hello',
      projectId: '00000000-0000-0000-0000-000000000099' as import('@nous/shared').ProjectId,
      traceId: '550e8400-e29b-41d4-a716-446655440188' as import('@nous/shared').TraceId,
    });

    // Plain text should have contentType text (or undefined)
    expect(result.contentType).toBe('text');

    // STM assistant entry should NOT have metadata with contentType
    const assistantEntry = stmEntries.find(e => e.role === 'assistant');
    expect(assistantEntry).toBeDefined();
    expect(assistantEntry?.metadata).toBeUndefined();
  });
});
