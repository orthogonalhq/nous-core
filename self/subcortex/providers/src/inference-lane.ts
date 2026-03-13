import { randomUUID } from 'node:crypto';
import { NousError } from '@nous/shared';
import type {
  ModelRequest,
  ModelStreamChunk,
} from '@nous/shared';

export type InferencePriority =
  | 'interactive'
  | 'coordination'
  | 'orchestration'
  | 'background';

export interface LaneWaitEstimate {
  queuedAhead: number;
  estimatedWaitMs: number;
}

export interface InferenceLaneLeaseState {
  held: boolean;
  leaseId?: string;
  holderType?: 'voice_call';
  acquiredAt?: string;
}

export interface InferenceLaneAnalytics {
  laneKey: string;
  queuedCount: number;
  activeCount: number;
  leaseState: InferenceLaneLeaseState;
  avgWaitMs: number;
  p95WaitMs: number;
}

export class LeaseHeldError extends NousError {
  constructor(detail: { laneKey: string; leaseId?: string; holderType?: 'voice_call' }) {
    super('Lane lease held.', 'LEASE_HELD', detail);
  }
}

type LaneMode = 'enqueue' | 'reinsert';

interface LaneEntry<T> {
  id: string;
  mode: LaneMode;
  request: ModelRequest;
  priority: InferencePriority;
  enqueuedAtMs: number;
  execute: (request: ModelRequest) => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

interface ActiveLaneEntry<T> {
  entry: LaneEntry<T>;
  controller: AbortController;
  startedAtMs: number;
  preempted: boolean;
}

const PRIORITY_RANK: Record<InferencePriority, number> = {
  background: 0,
  orchestration: 1,
  coordination: 2,
  interactive: 3,
};

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile95(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index] ?? 0;
}

function toInferencePriority(
  agentClass?: ModelRequest['agentClass'],
): InferencePriority {
  switch (agentClass) {
    case 'Cortex::Principal':
      return 'interactive';
    case 'Cortex::System':
      return 'coordination';
    case 'Orchestrator':
      return 'orchestration';
    default:
      return 'background';
  }
}

export class InferenceLane {
  private readonly queue: Array<LaneEntry<any>> = [];
  private readonly active = new Map<string, ActiveLaneEntry<any>>();
  private readonly waitHistory: number[] = [];
  private leaseState: InferenceLaneLeaseState = { held: false };
  private readonly releaseListeners = new Set<
    (event: { laneKey: string; leaseId?: string; holderType?: 'voice_call' }) => void
  >();

  constructor(
    readonly laneKey: string,
    private readonly capacity = 1,
    private readonly now = () => new Date().toISOString(),
  ) {}

  enqueue<T>(
    request: ModelRequest,
    execute: (request: ModelRequest) => Promise<T>,
  ): Promise<T> {
    if (this.leaseState.held) {
      throw new LeaseHeldError({
        laneKey: this.laneKey,
        leaseId: this.leaseState.leaseId,
        holderType: this.leaseState.holderType,
      });
    }

    return this.submit('enqueue', request, execute);
  }

  reinsertPreempted<T>(
    request: ModelRequest,
    execute: (request: ModelRequest) => Promise<T>,
  ): Promise<T> {
    return this.submit('reinsert', request, execute);
  }

  async *stream(
    request: ModelRequest,
    execute: (request: ModelRequest) => AsyncIterable<ModelStreamChunk>,
  ): AsyncIterable<ModelStreamChunk> {
    const chunks = await this.enqueue(request, async (laneRequest) => {
      const buffered: ModelStreamChunk[] = [];
      for await (const chunk of execute(laneRequest)) {
        buffered.push(chunk);
      }
      return buffered;
    });

    for (const chunk of chunks) {
      yield chunk;
    }
  }

  acquireLease(input: { leaseId?: string; holderType: 'voice_call' }): string {
    const leaseId = input.leaseId ?? randomUUID();
    this.leaseState = {
      held: true,
      leaseId,
      holderType: input.holderType,
      acquiredAt: this.now(),
    };
    return leaseId;
  }

  releaseLease(leaseId?: string): void {
    if (!this.leaseState.held) {
      return;
    }
    if (leaseId && this.leaseState.leaseId && leaseId !== this.leaseState.leaseId) {
      return;
    }

    const event = {
      laneKey: this.laneKey,
      leaseId: this.leaseState.leaseId,
      holderType: this.leaseState.holderType,
    };
    this.leaseState = { held: false };
    for (const listener of this.releaseListeners) {
      listener(event);
    }
    void this.schedule();
  }

  onLeaseReleased(
    listener: (event: { laneKey: string; leaseId?: string; holderType?: 'voice_call' }) => void,
  ): () => void {
    this.releaseListeners.add(listener);
    return () => {
      this.releaseListeners.delete(listener);
    };
  }

  getAnalytics(): InferenceLaneAnalytics {
    return {
      laneKey: this.laneKey,
      queuedCount: this.queue.length,
      activeCount: this.active.size,
      leaseState: { ...this.leaseState },
      avgWaitMs: average(this.waitHistory),
      p95WaitMs: percentile95(this.waitHistory),
    };
  }

  getWaitEstimate(_request: ModelRequest): LaneWaitEstimate {
    return {
      queuedAhead: this.queue.length,
      estimatedWaitMs: average(this.waitHistory) * Math.max(1, this.queue.length),
    };
  }

  private submit<T>(
    mode: LaneMode,
    request: ModelRequest,
    execute: (request: ModelRequest) => Promise<T>,
  ): Promise<T> {
    if (request.abortSignal?.aborted) {
      return Promise.reject(new NousError('Provider request aborted.', 'ABORTED'));
    }

    return new Promise<T>((resolve, reject) => {
      const entry: LaneEntry<T> = {
        id: randomUUID(),
        mode,
        request,
        priority: toInferencePriority(request.agentClass),
        enqueuedAtMs: Date.now(),
        execute,
        resolve,
        reject,
      };

      this.queueEntry(entry as LaneEntry<any>);
      this.maybePreempt(entry.priority);
      void this.schedule();
    });
  }

  private queueEntry(entry: LaneEntry<any>): void {
    if (entry.mode === 'reinsert') {
      const insertIndex = this.queue.findIndex(
        (queued) => PRIORITY_RANK[queued.priority] <= PRIORITY_RANK[entry.priority],
      );
      if (insertIndex === -1) {
        this.queue.push(entry);
      } else {
        this.queue.splice(insertIndex, 0, entry);
      }
      return;
    }

    this.queue.push(entry);
    this.queue.sort((left, right) => {
      if (left.mode !== right.mode) {
        return left.mode === 'reinsert' ? -1 : 1;
      }
      if (left.priority !== right.priority) {
        return PRIORITY_RANK[right.priority] - PRIORITY_RANK[left.priority];
      }
      return left.enqueuedAtMs - right.enqueuedAtMs;
    });
  }

  private maybePreempt(incomingPriority: InferencePriority): void {
    if (incomingPriority !== 'interactive' || this.active.size < this.capacity) {
      return;
    }

    const preemptable = Array.from(this.active.values())
      .filter((active) => PRIORITY_RANK[active.entry.priority] < PRIORITY_RANK.interactive)
      .sort(
        (left, right) =>
          PRIORITY_RANK[left.entry.priority] - PRIORITY_RANK[right.entry.priority],
      )[0];

    if (!preemptable) {
      return;
    }

    preemptable.preempted = true;
    preemptable.controller.abort('lane_preempted');
  }

  private async schedule(): Promise<void> {
    while (this.active.size < this.capacity && this.queue.length > 0) {
      const entry = this.queue.shift();
      if (!entry) {
        return;
      }

      const controller = new AbortController();
      const signal = entry.request.abortSignal
        ? AbortSignal.any([entry.request.abortSignal, controller.signal])
        : controller.signal;
      const activeEntry: ActiveLaneEntry<unknown> = {
        entry,
        controller,
        startedAtMs: Date.now(),
        preempted: false,
      };
      this.active.set(entry.id, activeEntry);
      this.waitHistory.push(activeEntry.startedAtMs - entry.enqueuedAtMs);

      void Promise.resolve()
        .then(() =>
          entry.execute({
            ...entry.request,
            abortSignal: signal,
          }),
        )
        .then((value) => {
          this.active.delete(entry.id);
          entry.resolve(value);
        })
        .catch((error) => {
          this.active.delete(entry.id);
          if (activeEntry.preempted) {
            this.queueEntry({
              ...entry,
              mode: 'reinsert',
              enqueuedAtMs: Date.now(),
            });
            return;
          }
          entry.reject(error);
        })
        .finally(() => {
          void this.schedule();
        });
    }
  }
}
