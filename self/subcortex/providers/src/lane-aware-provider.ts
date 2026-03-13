import type {
  IModelProvider,
  ModelProviderConfig,
  ModelRequest,
  ModelResponse,
  ModelStreamChunk,
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
}
