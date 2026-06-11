import { describe, it, expect, vi } from 'vitest';
import type {
  IEventBus,
  IModelProvider,
  ModelProviderConfig,
  ModelRequest,
  ModelResponse,
} from '@nous/shared';
import { LaneAwareProvider } from '../lane-aware-provider.js';
import { InferenceLane } from '../inference-lane.js';

const PROVIDER_ID = '00000000-0000-0000-0000-000000000001' as never;
const TRACE_ID = '00000000-0000-0000-0000-000000000099' as never;

function makeBaseInner(extra?: Partial<IModelProvider>): IModelProvider {
  return {
    getConfig: () =>
      ({
        id: PROVIDER_ID,
        name: 'test-provider',
        type: 'ollama',
        modelId: 'm',
        isLocal: true,
        capabilities: ['text'],
      }) as unknown as ModelProviderConfig,
    invoke: vi.fn().mockResolvedValue({
      output: 'invoke result',
      providerId: PROVIDER_ID,
      usage: { inputTokens: 1, outputTokens: 1 },
      traceId: TRACE_ID,
    } satisfies ModelResponse),
    stream: vi.fn(),
    ...extra,
  } as IModelProvider;
}

function makeBus(): IEventBus {
  return {
    publish: vi.fn(),
    subscribe: vi.fn().mockReturnValue('s'),
    unsubscribe: vi.fn(),
    dispose: vi.fn(),
  };
}

function makeRequest(): ModelRequest {
  return {
    role: 'cortex-chat',
    input: { messages: [{ role: 'user', content: 'hi' }] },
    traceId: TRACE_ID,
    agentClass: 'Cortex::Principal',
  } as ModelRequest;
}

describe('LaneAwareProvider — invokeWithThinkingStream pass-through', () => {
  it('typeof positive: when inner exposes invokeWithThinkingStream, wrapper exposes it as a function', () => {
    const inner = makeBaseInner({
      invokeWithThinkingStream: vi.fn().mockResolvedValue({
        output: { content: 'x' },
        providerId: PROVIDER_ID,
        usage: { inputTokens: 1, outputTokens: 1 },
        traceId: TRACE_ID,
      } satisfies ModelResponse),
    });
    const wrapper = new LaneAwareProvider(inner, new InferenceLane('lane:test'));
    expect(typeof wrapper.invokeWithThinkingStream).toBe('function');
  });

  it('typeof negative: when inner lacks the method, wrapper returns undefined', () => {
    const inner = makeBaseInner();
    const wrapper = new LaneAwareProvider(inner, new InferenceLane('lane:test'));
    expect(wrapper.invokeWithThinkingStream).toBeUndefined();
    expect(typeof wrapper.invokeWithThinkingStream).toBe('undefined');
  });

  it('delegates the call through the inference lane (lane.enqueue is exercised)', async () => {
    const itsImpl = vi.fn().mockResolvedValue({
      output: { content: 'z' },
      providerId: PROVIDER_ID,
      usage: { inputTokens: 1, outputTokens: 1 },
      traceId: TRACE_ID,
    } satisfies ModelResponse);
    const inner = makeBaseInner({ invokeWithThinkingStream: itsImpl });
    const lane = new InferenceLane('lane:test');
    const enqueueSpy = vi.spyOn(lane, 'enqueue');
    const wrapper = new LaneAwareProvider(inner, lane);
    const bus = makeBus();

    await wrapper.invokeWithThinkingStream!(makeRequest(), bus, TRACE_ID);
    expect(enqueueSpy).toHaveBeenCalled();
    expect(itsImpl).toHaveBeenCalled();
  });

  it('behavior parity: response from inner is returned to caller unchanged', async () => {
    const expected: ModelResponse = {
      output: { content: 'parity', thinking: 'reason' },
      providerId: PROVIDER_ID,
      usage: { inputTokens: 9, outputTokens: 8 },
      traceId: TRACE_ID,
    };
    const inner = makeBaseInner({ invokeWithThinkingStream: vi.fn().mockResolvedValue(expected) });
    const wrapper = new LaneAwareProvider(inner, new InferenceLane('lane:test'));
    const bus = makeBus();

    const response = await wrapper.invokeWithThinkingStream!(makeRequest(), bus, TRACE_ID);
    expect(response).toEqual(expected);
  });
});
