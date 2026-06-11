import type {
  IEventBus,
  IModelProvider,
  ModelProviderConfig,
  ModelRequest,
  ModelResponse,
  ModelStreamChunk,
  TraceId,
} from '@nous/shared';
import { InferenceLane } from './inference-lane.js';

export class LaneAwareProvider implements IModelProvider {
  constructor(
    private readonly inner: IModelProvider,
    private readonly lane: InferenceLane,
  ) {}

  getConfig(): ModelProviderConfig {
    return this.inner.getConfig();
  }

  invoke(request: ModelRequest): Promise<ModelResponse> {
    return this.lane.enqueue(request, (laneRequest) => this.inner.invoke(laneRequest));
  }

  stream(request: ModelRequest): AsyncIterable<ModelStreamChunk> {
    return this.lane.stream(request, (laneRequest) => this.inner.stream(laneRequest));
  }

  /**
   * Optional `invokeWithThinkingStream` pass-through. Exposed via a getter so
   * `typeof wrapped.invokeWithThinkingStream === 'function'` returns `true`
   * ONLY when the inner provider implements the method. This preserves the
   * gateway's capability-check semantics across the wrapper stack
   * (SDS Invariant I-9).
   *
   * The delegated call runs through the inference lane just like `invoke()`
   * so concurrency/lease semantics apply identically — the new method shares
   * the same back-pressure/lease envelope as `invoke()`.
   */
  get invokeWithThinkingStream():
    | ((request: ModelRequest, eventBus: IEventBus, traceId: TraceId) => Promise<ModelResponse>)
    | undefined {
    if (typeof this.inner.invokeWithThinkingStream !== 'function') return undefined;
    return (request, eventBus, traceId) =>
      this.lane.enqueue(request, (laneRequest) =>
        this.inner.invokeWithThinkingStream!(laneRequest, eventBus, traceId),
      );
  }
}
