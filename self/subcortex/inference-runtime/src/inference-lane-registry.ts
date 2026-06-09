import type { ModelProviderConfig } from '@nous/shared';
import type { InferenceLaneAnalytics } from './inference-lane.js';
import { InferenceLane } from './inference-lane.js';

function toLaneKey(config: ModelProviderConfig): string {
  return `${config.id}:${config.endpoint ?? config.modelId}`;
}

export interface LaneLeaseReleasedEvent {
  laneKey: string;
  leaseId?: string;
  holderType?: 'voice_call';
}

export class InferenceLaneRegistry {
  private readonly lanes = new Map<string, InferenceLane>();
  private readonly listeners = new Set<(event: LaneLeaseReleasedEvent) => void>();

  getOrCreate(config: ModelProviderConfig): InferenceLane {
    const laneKey = toLaneKey(config);
    const existing = this.lanes.get(laneKey);
    if (existing) {
      return existing;
    }

    const lane = new InferenceLane(laneKey);
    lane.onLeaseReleased((event) => {
      for (const listener of this.listeners) {
        listener(event);
      }
    });
    this.lanes.set(laneKey, lane);
    return lane;
  }

  onLeaseReleased(listener: (event: LaneLeaseReleasedEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  listAnalytics(): InferenceLaneAnalytics[] {
    return Array.from(this.lanes.values()).map((lane) => lane.getAnalytics());
  }
}
