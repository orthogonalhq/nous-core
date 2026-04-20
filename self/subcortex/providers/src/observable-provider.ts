/**
 * ObservableProvider — Instrumentation wrapper that emits inference events.
 *
 * Wraps any IModelProvider to measure latency and emit typed inference
 * events via the event bus. Uses fire-and-forget publish semantics:
 * event bus errors never propagate to callers.
 *
 * Wrapping order: ObservableProvider(LaneAwareProvider(ConcreteProvider))
 * per ADR 2 (provider-instrumentation-strategy-v1).
 */
import type {
  IEventBus,
  IModelProvider,
  ModelProviderConfig,
  ModelRequest,
  ModelResponse,
  ModelStreamChunk,
  TraceId,
} from '@nous/shared';

export interface ObservableProviderMeta {
  providerId: string;
  modelId: string;
  laneKey: string;
}

export class ObservableProvider implements IModelProvider {
  constructor(
    private readonly inner: IModelProvider,
    private readonly eventBus: IEventBus,
    private readonly meta: ObservableProviderMeta,
  ) {}

  getConfig(): ModelProviderConfig {
    return this.inner.getConfig();
  }

  async invoke(request: ModelRequest): Promise<ModelResponse> {
    const start = Date.now();
    const response = await this.inner.invoke(request);
    const latencyMs = Date.now() - start;

    try {
      this.eventBus.publish('inference:call-complete', {
        providerId: this.meta.providerId,
        modelId: this.meta.modelId,
        agentClass: request.agentClass,
        traceId: request.traceId,
        projectId: request.projectId,
        laneKey: this.meta.laneKey,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        latencyMs,
        routingDecision: undefined,
        emittedAt: new Date().toISOString(),
        correlationRunId: request.correlationRunId,
        correlationParentId: request.correlationParentId,
      });
    } catch { /* fire-and-forget */ }

    return response;
  }

  /**
   * Optional `invokeWithThinkingStream` pass-through. Exposed via a getter so
   * `typeof wrapped.invokeWithThinkingStream === 'function'` returns `true`
   * ONLY when the inner provider implements the method (SDS Invariant I-9).
   *
   * On success the wrapper emits `inference:call-complete` mirroring the
   * `invoke()` emission path, so existing latency/usage observability keeps
   * working for the new dispatch path.
   */
  get invokeWithThinkingStream():
    | ((request: ModelRequest, eventBus: IEventBus, traceId: TraceId) => Promise<ModelResponse>)
    | undefined {
    if (typeof this.inner.invokeWithThinkingStream !== 'function') return undefined;
    const inner = this.inner;
    const observabilityBus = this.eventBus;
    const meta = this.meta;
    return async (request, eventBus, traceId) => {
      const start = Date.now();
      const response = await inner.invokeWithThinkingStream!(request, eventBus, traceId);
      const latencyMs = Date.now() - start;
      try {
        observabilityBus.publish('inference:call-complete', {
          providerId: meta.providerId,
          modelId: meta.modelId,
          agentClass: request.agentClass,
          traceId: request.traceId,
          projectId: request.projectId,
          laneKey: meta.laneKey,
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          latencyMs,
          routingDecision: undefined,
          emittedAt: new Date().toISOString(),
          correlationRunId: request.correlationRunId,
          correlationParentId: request.correlationParentId,
        });
      } catch { /* fire-and-forget */ }
      return response;
    };
  }

  stream(request: ModelRequest): AsyncIterable<ModelStreamChunk> {
    const inner = this.inner;
    const eventBus = this.eventBus;
    const meta = this.meta;

    return {
      [Symbol.asyncIterator](): AsyncIterator<ModelStreamChunk> {
        let iterator: AsyncIterator<ModelStreamChunk> | null = null;
        let started = false;
        const start = Date.now();
        let lastUsage: { inputTokens?: number; outputTokens?: number } | undefined;

        return {
          async next(): Promise<IteratorResult<ModelStreamChunk>> {
            if (!iterator) {
              const iterable = inner.stream(request);
              iterator = iterable[Symbol.asyncIterator]();
            }

            if (!started) {
              started = true;
              try {
                eventBus.publish('inference:stream-start', {
                  providerId: meta.providerId,
                  modelId: meta.modelId,
                  agentClass: request.agentClass,
                  traceId: request.traceId,
                  projectId: request.projectId,
                  laneKey: meta.laneKey,
                  emittedAt: new Date().toISOString(),
                });
              } catch { /* fire-and-forget */ }
            }

            const result = await iterator.next();

            if (!result.done) {
              const chunk = result.value;
              if (chunk.usage) {
                lastUsage = chunk.usage;
              }
              if (chunk.done) {
                const latencyMs = Date.now() - start;
                try {
                  eventBus.publish('inference:stream-complete', {
                    providerId: meta.providerId,
                    modelId: meta.modelId,
                    agentClass: request.agentClass,
                    traceId: request.traceId,
                    projectId: request.projectId,
                    laneKey: meta.laneKey,
                    inputTokens: lastUsage?.inputTokens,
                    outputTokens: lastUsage?.outputTokens,
                    latencyMs,
                    routingDecision: undefined,
                    emittedAt: new Date().toISOString(),
                    correlationRunId: request.correlationRunId,
                    correlationParentId: request.correlationParentId,
                  });
                } catch { /* fire-and-forget */ }
              }
            }

            return result;
          },
        };
      },
    };
  }
}
