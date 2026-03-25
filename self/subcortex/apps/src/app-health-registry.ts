import {
  AppHealthSnapshotSchema,
  AppHeartbeatSignalSchema,
  type AppHealthSnapshot,
  type AppHeartbeatSignal,
  type IEventBus,
} from '@nous/shared';

export interface AppHealthRegistryOptions {
  now?: () => Date;
  eventBus?: IEventBus;
}

export class AppHealthRegistry {
  private readonly now: () => Date;
  private readonly eventBus?: IEventBus;
  private readonly snapshots = new Map<string, AppHealthSnapshot>();
  private readonly heartbeatSequences = new Map<string, number>();

  constructor(options: AppHealthRegistryOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.eventBus = options.eventBus;
  }

  initializeSession(sessionId: string): AppHealthSnapshot {
    const snapshot = AppHealthSnapshotSchema.parse({
      session_id: sessionId,
      status: 'healthy',
      reported_at: this.now().toISOString(),
      stale: false,
      details: {},
    });
    this.snapshots.set(sessionId, snapshot);
    this.heartbeatSequences.set(sessionId, -1);
    this.eventBus?.publish('app-health:change', { appId: 'unknown', sessionId, status: 'healthy' });
    return snapshot;
  }

  updateSnapshot(snapshot: AppHealthSnapshot): AppHealthSnapshot {
    const parsed = AppHealthSnapshotSchema.parse(snapshot);
    this.snapshots.set(parsed.session_id, parsed);
    this.eventBus?.publish('app-health:change', {
      appId: 'unknown',
      sessionId: parsed.session_id,
      status: parsed.status as 'healthy' | 'degraded' | 'stale' | 'disconnected',
    });
    return parsed;
  }

  recordHeartbeat(signal: AppHeartbeatSignal): AppHealthSnapshot {
    const parsed = AppHeartbeatSignalSchema.parse(signal);
    const previousSequence = this.heartbeatSequences.get(parsed.session_id) ?? -1;
    const skippedSequence = parsed.sequence > previousSequence + 1;
    this.heartbeatSequences.set(parsed.session_id, parsed.sequence);

    const nextSnapshot = AppHealthSnapshotSchema.parse({
      session_id: parsed.session_id,
      status: skippedSequence ? 'degraded' : parsed.status_hint ?? 'healthy',
      reported_at: parsed.reported_at,
      stale: false,
      details: skippedSequence
        ? { reason: 'heartbeat_sequence_gap', previousSequence, nextSequence: parsed.sequence }
        : {},
    });
    this.snapshots.set(parsed.session_id, nextSnapshot);
    this.eventBus?.publish('app-health:heartbeat', {
      appId: 'unknown',
      sessionId: parsed.session_id,
      timestamp: parsed.reported_at,
    });
    return nextSnapshot;
  }

  markStaleSessions(maxAgeMs: number): AppHealthSnapshot[] {
    const nowMs = this.now().getTime();
    const updated: AppHealthSnapshot[] = [];

    for (const [sessionId, snapshot] of this.snapshots.entries()) {
      const ageMs = nowMs - new Date(snapshot.reported_at).getTime();
      if (ageMs <= maxAgeMs) {
        continue;
      }

      const nextSnapshot = AppHealthSnapshotSchema.parse({
        ...snapshot,
        status: 'stale',
        stale: true,
        details: {
          ...snapshot.details,
          staleAfterMs: maxAgeMs,
          ageMs,
        },
      });
      this.snapshots.set(sessionId, nextSnapshot);
      this.eventBus?.publish('app-health:change', {
        appId: 'unknown',
        sessionId,
        status: 'stale',
      });
      updated.push(nextSnapshot);
    }

    return updated;
  }

  getSnapshot(sessionId: string): AppHealthSnapshot | null {
    return this.snapshots.get(sessionId) ?? null;
  }

  listSnapshots(): AppHealthSnapshot[] {
    return [...this.snapshots.values()];
  }

  removeSession(sessionId: string): void {
    this.snapshots.delete(sessionId);
    this.heartbeatSequences.delete(sessionId);
  }
}
