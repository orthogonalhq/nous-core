import { describe, it, expect, vi } from 'vitest';
import type {
  IEventBus,
  IModelProvider,
  ModelProviderConfig,
  ModelRequest,
  ModelResponse,
} from '@nous/shared';
import { ObservableProvider } from '../observable-provider.js';

const PROVIDER_ID = '00000000-0000-0000-0000-000000000001' as never;
const TRACE_ID = '00000000-0000-0000-0000-000000000099' as never;

function makeMeta() {
  return { providerId: PROVIDER_ID, modelId: 'm', laneKey: 'lane-1' };
}

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

function makeRequest(overrides?: Partial<ModelRequest>): ModelRequest {
  return {
    role: 'cortex-chat',
    input: { messages: [{ role: 'user', content: 'hi' }] },
    traceId: TRACE_ID,
    projectId: '00000000-0000-0000-0000-000000000010' as never,
    agentClass: 'Cortex::Principal',
    ...overrides,
  } as ModelRequest;
}

describe('ObservableProvider — invokeWithThinkingStream pass-through', () => {
  it('typeof positive: when inner exposes invokeWithThinkingStream, wrapper exposes it', () => {
    const inner = makeBaseInner({
      invokeWithThinkingStream: vi.fn().mockResolvedValue({
        output: { content: 'x' },
        providerId: PROVIDER_ID,
        usage: { inputTokens: 1, outputTokens: 1 },
        traceId: TRACE_ID,
      } satisfies ModelResponse),
    });
    const wrapper = new ObservableProvider(inner, makeBus(), makeMeta());
    expect(typeof wrapper.invokeWithThinkingStream).toBe('function');
  });

  it('typeof negative: when inner lacks the method, wrapper returns undefined', () => {
    const inner = makeBaseInner();
    const wrapper = new ObservableProvider(inner, makeBus(), makeMeta());
    expect(wrapper.invokeWithThinkingStream).toBeUndefined();
  });

  it('emits inference:call-complete on success (mirrors invoke() emission)', async () => {
    const inner = makeBaseInner({
      invokeWithThinkingStream: vi.fn().mockResolvedValue({
        output: { content: 'ok', thinking: 'r' },
        providerId: PROVIDER_ID,
        usage: { inputTokens: 4, outputTokens: 7 },
        traceId: TRACE_ID,
      } satisfies ModelResponse),
    });
    const observabilityBus = makeBus();
    const wrapper = new ObservableProvider(inner, observabilityBus, makeMeta());
    const downstreamBus = makeBus(); // separate bus passed into invokeWithThinkingStream

    await wrapper.invokeWithThinkingStream!(makeRequest(), downstreamBus, TRACE_ID);

    expect(observabilityBus.publish).toHaveBeenCalledWith(
      'inference:call-complete',
      expect.objectContaining({
        providerId: PROVIDER_ID,
        modelId: 'm',
        agentClass: 'Cortex::Principal',
        traceId: TRACE_ID,
        laneKey: 'lane-1',
        inputTokens: 4,
        outputTokens: 7,
        latencyMs: expect.any(Number),
      }),
    );
  });

  it('error from inner propagates to caller; observability bus does NOT emit call-complete', async () => {
    const inner = makeBaseInner({
      invokeWithThinkingStream: vi.fn().mockRejectedValue(new Error('inner failed')),
    });
    const observabilityBus = makeBus();
    const wrapper = new ObservableProvider(inner, observabilityBus, makeMeta());

    await expect(
      wrapper.invokeWithThinkingStream!(makeRequest(), makeBus(), TRACE_ID),
    ).rejects.toThrow('inner failed');

    // call-complete is only emitted on success.
    const publishedCallComplete = (observabilityBus.publish as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call) => call[0] === 'inference:call-complete',
    );
    expect(publishedCallComplete).toHaveLength(0);
  });
});
