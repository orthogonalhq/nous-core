import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObservableProvider } from '../observable-provider.js';
import type {
  IEventBus,
  IModelProvider,
  ModelProviderConfig,
  ModelRequest,
  ModelResponse,
  ModelStreamChunk,
} from '@nous/shared';

// --- Helpers ---

function createMockEventBus(): IEventBus {
  return {
    publish: vi.fn(),
    subscribe: vi.fn().mockReturnValue('sub-1'),
    unsubscribe: vi.fn(),
    dispose: vi.fn(),
  };
}

function createMockProvider(overrides?: {
  invoke?: IModelProvider['invoke'];
  stream?: IModelProvider['stream'];
}): IModelProvider {
  const config = {
    id: 'provider-1',
    name: 'test-provider',
    type: 'ollama',
    modelId: 'test-model',
    isLocal: true,
    capabilities: [],
  } as unknown as ModelProviderConfig;
  return {
    getConfig: () => config,
    invoke: overrides?.invoke ?? vi.fn().mockResolvedValue({
      output: 'test output',
      providerId: 'provider-1',
      usage: { inputTokens: 100, outputTokens: 50, computeMs: 500 },
      traceId: 'trace-1',
    } as ModelResponse),
    stream: overrides?.stream ?? vi.fn().mockReturnValue(
      (async function* () {
        yield { content: 'chunk1', done: false } as ModelStreamChunk;
        yield { content: 'chunk2', done: false, usage: { inputTokens: 100, outputTokens: 50 } } as ModelStreamChunk;
        yield { content: '', done: true, usage: { inputTokens: 100, outputTokens: 80 } } as ModelStreamChunk;
      })(),
    ),
  };
}

function createRequest(overrides?: Partial<ModelRequest>): ModelRequest {
  return {
    role: 'primary' as any,
    input: 'test input',
    traceId: 'trace-1' as any,
    projectId: 'project-1' as any,
    agentClass: 'Cortex::Principal' as any,
    ...overrides,
  };
}

const META = {
  providerId: 'provider-1',
  modelId: 'test-model',
  laneKey: 'lane-1',
};

describe('ObservableProvider', () => {
  let eventBus: IEventBus;
  let innerProvider: IModelProvider;
  let provider: ObservableProvider;

  beforeEach(() => {
    eventBus = createMockEventBus();
    innerProvider = createMockProvider();
    provider = new ObservableProvider(innerProvider, eventBus, META);
  });

  // --- Contract Tests (Tier 1) ---

  describe('getConfig()', () => {
    it('delegates to inner provider', () => {
      const config = provider.getConfig();
      expect(config.name).toBe('test-provider');
      expect(config.modelId).toBe('test-model');
    });
  });

  describe('invoke()', () => {
    it('emits inference:call-complete with correct fields matching schema', async () => {
      const request = createRequest();
      const response = await provider.invoke(request);

      expect(response.output).toBe('test output');
      expect(eventBus.publish).toHaveBeenCalledWith(
        'inference:call-complete',
        expect.objectContaining({
          providerId: 'provider-1',
          modelId: 'test-model',
          agentClass: 'Cortex::Principal',
          traceId: 'trace-1',
          projectId: 'project-1',
          laneKey: 'lane-1',
          inputTokens: 100,
          outputTokens: 50,
          routingDecision: undefined,
          emittedAt: expect.any(String),
          latencyMs: expect.any(Number),
        }),
      );
    });

    it('providerId, modelId, laneKey come from constructor meta, not inner provider', async () => {
      const customProvider = new ObservableProvider(
        innerProvider,
        eventBus,
        { providerId: 'custom-id', modelId: 'custom-model', laneKey: 'custom-lane' },
      );
      await customProvider.invoke(createRequest());

      expect(eventBus.publish).toHaveBeenCalledWith(
        'inference:call-complete',
        expect.objectContaining({
          providerId: 'custom-id',
          modelId: 'custom-model',
          laneKey: 'custom-lane',
        }),
      );
    });

    it('agentClass, traceId, projectId come from ModelRequest', async () => {
      const request = createRequest({
        agentClass: 'Worker' as any,
        traceId: 'custom-trace' as any,
        projectId: 'custom-project' as any,
      });
      await provider.invoke(request);

      expect(eventBus.publish).toHaveBeenCalledWith(
        'inference:call-complete',
        expect.objectContaining({
          agentClass: 'Worker',
          traceId: 'custom-trace',
          projectId: 'custom-project',
        }),
      );
    });

    it('routingDecision is undefined (V1)', async () => {
      await provider.invoke(createRequest());

      expect(eventBus.publish).toHaveBeenCalledWith(
        'inference:call-complete',
        expect.objectContaining({
          routingDecision: undefined,
        }),
      );
    });
  });

  describe('stream()', () => {
    it('emits inference:stream-start before first chunk', async () => {
      const request = createRequest();
      const iterable = provider.stream(request);
      const iterator = iterable[Symbol.asyncIterator]();

      await iterator.next();

      expect(eventBus.publish).toHaveBeenCalledWith(
        'inference:stream-start',
        expect.objectContaining({
          providerId: 'provider-1',
          modelId: 'test-model',
          agentClass: 'Cortex::Principal',
          traceId: 'trace-1',
          projectId: 'project-1',
          laneKey: 'lane-1',
          emittedAt: expect.any(String),
        }),
      );
    });

    it('emits inference:stream-complete on final chunk (done: true)', async () => {
      const request = createRequest();
      const chunks: ModelStreamChunk[] = [];
      for await (const chunk of provider.stream(request)) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(3);
      expect(eventBus.publish).toHaveBeenCalledWith(
        'inference:stream-complete',
        expect.objectContaining({
          providerId: 'provider-1',
          modelId: 'test-model',
          agentClass: 'Cortex::Principal',
          traceId: 'trace-1',
          laneKey: 'lane-1',
          inputTokens: 100,
          outputTokens: 80,
          latencyMs: expect.any(Number),
          routingDecision: undefined,
          emittedAt: expect.any(String),
        }),
      );
    });
  });

  // --- Behavior Tests (Tier 2) ---

  describe('invoke() error handling', () => {
    it('error from inner provider propagates unchanged — no event emitted', async () => {
      const error = new Error('provider failure');
      const failingProvider = createMockProvider({
        invoke: vi.fn().mockRejectedValue(error),
      });
      const obs = new ObservableProvider(failingProvider, eventBus, META);

      await expect(obs.invoke(createRequest())).rejects.toThrow('provider failure');
      expect(eventBus.publish).not.toHaveBeenCalled();
    });

    it('eventBus.publish() error does not propagate to caller (try/catch safety)', async () => {
      (eventBus.publish as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('bus failure');
      });

      const response = await provider.invoke(createRequest());
      expect(response.output).toBe('test output');
    });
  });

  describe('stream() error handling', () => {
    it('error during iteration propagates — stream-start already emitted, no stream-complete', async () => {
      const failingProvider = createMockProvider({
        stream: vi.fn().mockReturnValue(
          (async function* () {
            yield { content: 'ok', done: false } satisfies ModelStreamChunk;
            throw new Error('stream failure');
          })(),
        ),
      });
      const obs = new ObservableProvider(failingProvider, eventBus, META);

      const chunks: ModelStreamChunk[] = [];
      await expect(async () => {
        for await (const chunk of obs.stream(createRequest())) {
          chunks.push(chunk);
        }
      }).rejects.toThrow('stream failure');

      expect(chunks).toHaveLength(1);
      expect(eventBus.publish).toHaveBeenCalledWith('inference:stream-start', expect.any(Object));
      expect(eventBus.publish).not.toHaveBeenCalledWith('inference:stream-complete', expect.any(Object));
    });

    it('eventBus.publish() error in stream path does not propagate to caller', async () => {
      (eventBus.publish as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('bus failure');
      });

      const chunks: ModelStreamChunk[] = [];
      for await (const chunk of provider.stream(createRequest())) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(3);
    });
  });

  describe('latency measurement', () => {
    it('wraps full inner call duration', async () => {
      const slowProvider = createMockProvider({
        invoke: vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve({
            output: 'slow',
            providerId: 'provider-1',
            usage: { inputTokens: 10, outputTokens: 5 },
            traceId: 'trace-1',
          }), 50)),
        ),
      });
      const obs = new ObservableProvider(slowProvider, eventBus, META);
      await obs.invoke(createRequest());

      const publishCall = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(publishCall[1].latencyMs).toBeGreaterThanOrEqual(40);
    });
  });

  // --- Edge Case Tests (Tier 3) ---

  describe('edge cases', () => {
    it('stream with immediate done still emits stream-start + stream-complete', async () => {
      const immediateDoneProvider = createMockProvider({
        stream: vi.fn().mockReturnValue(
          (async function* () {
            yield { content: '', done: true } satisfies ModelStreamChunk;
          })(),
        ),
      });
      const obs = new ObservableProvider(immediateDoneProvider, eventBus, META);

      const chunks: ModelStreamChunk[] = [];
      for await (const chunk of obs.stream(createRequest())) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(eventBus.publish).toHaveBeenCalledWith('inference:stream-start', expect.any(Object));
      expect(eventBus.publish).toHaveBeenCalledWith('inference:stream-complete', expect.any(Object));
    });

    it('stream chunk without usage field does not break stream-complete emission', async () => {
      const noUsageProvider = createMockProvider({
        stream: vi.fn().mockReturnValue(
          (async function* () {
            yield { content: 'data', done: false } satisfies ModelStreamChunk;
            yield { content: '', done: true } satisfies ModelStreamChunk;
          })(),
        ),
      });
      const obs = new ObservableProvider(noUsageProvider, eventBus, META);

      for await (const _chunk of obs.stream(createRequest())) {
        // consume
      }

      expect(eventBus.publish).toHaveBeenCalledWith(
        'inference:stream-complete',
        expect.objectContaining({
          inputTokens: undefined,
          outputTokens: undefined,
        }),
      );
    });
  });
});
