/**
 * InferenceProjectionAdapter — Per-agent inference state tracker for MAO projections.
 *
 * Subscribes to inference events and maintains per-agent state, bounded history
 * ring buffer, and active stream tracking. Used by MaoProjectionService to
 * enrich agent projections with inference data per ADR 4.
 */
import type {
  IEventBus,
  InferenceCallCompletePayload,
  InferenceStreamStartPayload,
  InferenceStreamCompletePayload,
} from '@nous/shared';

export interface AgentInferenceState {
  lastProviderId: string;
  lastModelId: string;
  lastLatencyMs: number;
  totalTokens: number;
  callCount: number;
  isStreaming: boolean;
}

export interface InferenceHistoryEntry {
  providerId: string;
  modelId: string;
  agentClass?: string;
  traceId: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  timestamp: string;
}

export interface ActiveStreamEntry {
  providerId: string;
  modelId: string;
  agentClass?: string;
  traceId: string;
  startedAt: string;
}

export class InferenceProjectionAdapter {
  static readonly MAX_HISTORY_ENTRIES = 200;

  private readonly agentStates = new Map<string, AgentInferenceState>();
  private history: InferenceHistoryEntry[] = [];
  private readonly activeStreams = new Map<string, ActiveStreamEntry>();
  private subscriptionIds: string[] = [];
  private disposed = false;

  constructor(private readonly eventBus: IEventBus) {
    const callCompleteId = this.eventBus.subscribe('inference:call-complete', (payload) => {
      this.recordCall(payload);
    });
    const streamStartId = this.eventBus.subscribe('inference:stream-start', (payload) => {
      this.recordStreamStart(payload);
    });
    const streamCompleteId = this.eventBus.subscribe('inference:stream-complete', (payload) => {
      this.recordStreamComplete(payload);
    });
    this.subscriptionIds.push(callCompleteId, streamStartId, streamCompleteId);
  }

  private agentKey(payload: { agentClass?: string; traceId: string }): string {
    return payload.agentClass ?? payload.traceId;
  }

  private recordCall(payload: InferenceCallCompletePayload): void {
    if (this.disposed) return;
    const key = this.agentKey(payload);
    const tokens = (payload.inputTokens ?? 0) + (payload.outputTokens ?? 0);

    this.updateAgentState(key, {
      lastProviderId: payload.providerId,
      lastModelId: payload.modelId,
      lastLatencyMs: payload.latencyMs,
      tokens,
      isStreaming: false,
    });

    this.appendHistory({
      providerId: payload.providerId,
      modelId: payload.modelId,
      agentClass: payload.agentClass,
      traceId: payload.traceId,
      inputTokens: payload.inputTokens,
      outputTokens: payload.outputTokens,
      latencyMs: payload.latencyMs,
      timestamp: payload.emittedAt,
    });
  }

  private recordStreamStart(payload: InferenceStreamStartPayload): void {
    if (this.disposed) return;
    const key = this.agentKey(payload);

    // Create or update agent state — mark as streaming
    const existing = this.agentStates.get(key);
    if (existing) {
      existing.isStreaming = true;
      existing.lastProviderId = payload.providerId;
      existing.lastModelId = payload.modelId;
    } else {
      this.agentStates.set(key, {
        lastProviderId: payload.providerId,
        lastModelId: payload.modelId,
        lastLatencyMs: 0,
        totalTokens: 0,
        callCount: 0,
        isStreaming: true,
      });
    }

    this.activeStreams.set(payload.traceId, {
      providerId: payload.providerId,
      modelId: payload.modelId,
      agentClass: payload.agentClass,
      traceId: payload.traceId,
      startedAt: payload.emittedAt,
    });
  }

  private recordStreamComplete(payload: InferenceStreamCompletePayload): void {
    if (this.disposed) return;
    const key = this.agentKey(payload);
    const tokens = (payload.inputTokens ?? 0) + (payload.outputTokens ?? 0);

    this.updateAgentState(key, {
      lastProviderId: payload.providerId,
      lastModelId: payload.modelId,
      lastLatencyMs: payload.latencyMs,
      tokens,
      isStreaming: false,
    });

    this.activeStreams.delete(payload.traceId);

    this.appendHistory({
      providerId: payload.providerId,
      modelId: payload.modelId,
      agentClass: payload.agentClass,
      traceId: payload.traceId,
      inputTokens: payload.inputTokens,
      outputTokens: payload.outputTokens,
      latencyMs: payload.latencyMs,
      timestamp: payload.emittedAt,
    });
  }

  private updateAgentState(
    key: string,
    update: {
      lastProviderId: string;
      lastModelId: string;
      lastLatencyMs: number;
      tokens: number;
      isStreaming: boolean;
    },
  ): void {
    const existing = this.agentStates.get(key);
    if (existing) {
      existing.lastProviderId = update.lastProviderId;
      existing.lastModelId = update.lastModelId;
      existing.lastLatencyMs = update.lastLatencyMs;
      existing.totalTokens += update.tokens;
      existing.callCount += 1;
      existing.isStreaming = update.isStreaming;
    } else {
      this.agentStates.set(key, {
        lastProviderId: update.lastProviderId,
        lastModelId: update.lastModelId,
        lastLatencyMs: update.lastLatencyMs,
        totalTokens: update.tokens,
        callCount: 1,
        isStreaming: update.isStreaming,
      });
    }
  }

  private appendHistory(entry: InferenceHistoryEntry): void {
    this.history.push(entry);
    if (this.history.length > InferenceProjectionAdapter.MAX_HISTORY_ENTRIES) {
      this.history = this.history.slice(-InferenceProjectionAdapter.MAX_HISTORY_ENTRIES);
    }
  }

  getAgentInferenceState(agentClass: string): AgentInferenceState | null {
    return this.agentStates.get(agentClass) ?? null;
  }

  getInferenceHistory(options?: { agentClass?: string; limit?: number }): InferenceHistoryEntry[] {
    let entries = this.history;
    if (options?.agentClass) {
      entries = entries.filter((e) => e.agentClass === options.agentClass);
    }
    const limit = options?.limit ?? entries.length;
    return entries.slice(-limit);
  }

  getActiveStreams(): ActiveStreamEntry[] {
    return Array.from(this.activeStreams.values());
  }

  dispose(): void {
    this.disposed = true;
    for (const id of this.subscriptionIds) {
      this.eventBus.unsubscribe(id);
    }
    this.subscriptionIds = [];
    this.agentStates.clear();
    this.history = [];
    this.activeStreams.clear();
  }
}
