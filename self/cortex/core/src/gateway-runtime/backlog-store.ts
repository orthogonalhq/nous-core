import type { IDocumentStore } from '@nous/shared';
import type {
  BacklogAnalytics,
  BacklogEntry,
  BacklogEntryStatus,
  BacklogQueueConfig,
} from './backlog-types.js';
import {
  BacklogAnalyticsSchema,
  BacklogEntrySchema,
  GATEWAY_RUNTIME_BACKLOG_COLLECTION,
  compareBacklogEntries,
} from './backlog-types.js';

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

function matchSuspensionCriteria(
  entry: BacklogEntry,
  criteria?: { laneKey?: string; leaseId?: string },
): boolean {
  if (!criteria) {
    return true;
  }

  const detail = entry.suspensionDetail ?? {};
  if (criteria.laneKey && detail.laneKey !== criteria.laneKey) {
    return false;
  }
  if (criteria.leaseId && detail.leaseId !== criteria.leaseId) {
    return false;
  }
  return true;
}

export class DocumentBacklogStore {
  constructor(
    private readonly documentStore: IDocumentStore,
    private readonly collection = GATEWAY_RUNTIME_BACKLOG_COLLECTION,
  ) {}

  async put(entry: BacklogEntry): Promise<void> {
    const validated = BacklogEntrySchema.parse(entry);
    await this.documentStore.put(this.collection, validated.id, validated);
  }

  async get(id: string): Promise<BacklogEntry | null> {
    const entry = await this.documentStore.get<BacklogEntry>(this.collection, id);
    return entry ? BacklogEntrySchema.parse(entry) : null;
  }

  async list(): Promise<BacklogEntry[]> {
    const rows = await this.documentStore.query<BacklogEntry>(this.collection, {
      orderBy: 'acceptedAt',
      orderDirection: 'asc',
    });
    return rows.map((row) => BacklogEntrySchema.parse(row));
  }

  async listByStatus(status: BacklogEntryStatus): Promise<BacklogEntry[]> {
    const rows = await this.documentStore.query<BacklogEntry>(this.collection, {
      where: { status },
      orderBy: 'acceptedAt',
      orderDirection: 'asc',
    });
    return rows.map((row) => BacklogEntrySchema.parse(row));
  }

  async transition(
    id: string,
    nextStatus: BacklogEntryStatus,
    patch: Partial<BacklogEntry> = {},
  ): Promise<BacklogEntry | null> {
    const existing = await this.get(id);
    if (!existing) {
      return null;
    }

    const updated = BacklogEntrySchema.parse({
      ...existing,
      ...patch,
      status: nextStatus,
    });
    await this.put(updated);
    return updated;
  }

  async resetActiveToQueued(): Promise<number> {
    const active = await this.listByStatus('active');
    for (const entry of active) {
      await this.transition(entry.id, 'queued', {
        promotedAt: undefined,
        resultStatus: undefined,
      });
    }
    return active.length;
  }

  async requeueSuspended(criteria?: {
    laneKey?: string;
    leaseId?: string;
  }): Promise<BacklogEntry[]> {
    const suspended = await this.listByStatus('suspended');
    const matching = suspended.filter((entry) => matchSuspensionCriteria(entry, criteria));
    const updated: BacklogEntry[] = [];

    for (const entry of matching) {
      const next = await this.transition(entry.id, 'queued', {
        suspensionDetail: undefined,
        resultStatus: undefined,
        lastErrorCode: undefined,
        lastErrorMessage: undefined,
      });
      if (next) {
        updated.push(next);
      }
    }

    return updated.sort(compareBacklogEntries);
  }

  async pruneRetained(beforeIso: string): Promise<void> {
    const terminal = [
      ...(await this.listByStatus('completed')),
      ...(await this.listByStatus('failed')),
    ];

    for (const entry of terminal) {
      if (entry.completedAt && entry.completedAt < beforeIso) {
        await this.documentStore.delete(this.collection, entry.id);
      }
    }
  }

  async snapshotAnalytics(
    now: string,
    config: BacklogQueueConfig,
  ): Promise<BacklogAnalytics> {
    const allEntries = await this.list();
    const windowStart = new Date(Date.parse(now) - config.analyticsWindowMs).toISOString();
    const queuedCount = allEntries.filter((entry) => entry.status === 'queued').length;
    const activeCount = allEntries.filter((entry) => entry.status === 'active').length;
    const suspendedCount = allEntries.filter((entry) => entry.status === 'suspended').length;
    const windowEntries = allEntries.filter((entry) => entry.acceptedAt >= windowStart);
    const terminalWindowEntries = windowEntries.filter((entry) => entry.completedAt);
    const waitTimes = terminalWindowEntries
      .filter((entry) => entry.promotedAt)
      .map((entry) => Date.parse(entry.promotedAt!) - Date.parse(entry.acceptedAt));
    const executionTimes = terminalWindowEntries
      .filter((entry) => entry.promotedAt && entry.completedAt)
      .map((entry) => Date.parse(entry.completedAt!) - Date.parse(entry.promotedAt!));
    const completedInWindow = windowEntries.filter((entry) => entry.status === 'completed').length;
    const failedInWindow = windowEntries.filter((entry) => entry.status === 'failed').length;
    const peakQueueDepth = windowEntries.reduce(
      (peak, entry) => Math.max(peak, entry.queueDepthAtAcceptance),
      0,
    );

    // ADR Decision 5: 25%/75% windowed wait-time comparison with 20% threshold
    let pressureTrend: 'increasing' | 'stable' | 'decreasing' = 'stable';
    if (terminalWindowEntries.length > 0) {
      const sorted = [...terminalWindowEntries].sort(
        (a, b) => Date.parse(a.completedAt!) - Date.parse(b.completedAt!),
      );
      const cutoffIndex = Math.ceil(sorted.length * 0.75);
      const earlyEntries = sorted.slice(0, cutoffIndex);
      const recentEntries = sorted.slice(cutoffIndex);

      const earlyWaits = earlyEntries
        .filter((e) => e.promotedAt)
        .map((e) => Date.parse(e.promotedAt!) - Date.parse(e.acceptedAt));
      const recentWaits = recentEntries
        .filter((e) => e.promotedAt)
        .map((e) => Date.parse(e.promotedAt!) - Date.parse(e.acceptedAt));

      const earlyAvg = average(earlyWaits);
      const recentAvg = average(recentWaits);

      if (earlyWaits.length > 0 && recentWaits.length > 0) {
        if (recentAvg > earlyAvg * 1.2) {
          pressureTrend = 'increasing';
        } else if (recentAvg < earlyAvg * 0.8) {
          pressureTrend = 'decreasing';
        }
      }
    }

    return BacklogAnalyticsSchema.parse({
      queuedCount,
      activeCount,
      suspendedCount,
      activeCapacity: config.activeCapacity,
      windowStart,
      windowEnd: now,
      completedInWindow,
      failedInWindow,
      avgWaitMs: average(waitTimes),
      avgExecutionMs: average(executionTimes),
      p95WaitMs: percentile95(waitTimes),
      peakQueueDepth,
      pressureTrend,
    });
  }
}
