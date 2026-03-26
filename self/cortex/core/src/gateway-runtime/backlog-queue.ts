import { AgentResultSchema } from '@nous/shared';
import type { AgentResult, IDocumentStore } from '@nous/shared';
import { DocumentBacklogStore } from './backlog-store.js';
import type {
  BacklogAnalytics,
  BacklogEntry,
  BacklogEntryStatus,
  BacklogPriority,
  BacklogQueueConfig,
} from './backlog-types.js';
import {
  BacklogEntrySchema,
  BacklogQueueConfigSchema,
  compareBacklogEntries,
  toBacklogPriorityRank,
} from './backlog-types.js';
import type { GatewayRuntimeHealthSink } from './runtime-health.js';
import type { GatewaySubmissionSource } from './types.js';

export interface SystemBacklogSubmission {
  id: string;
  runId: string;
  dispatchRef: string;
  source: GatewaySubmissionSource;
  priority: BacklogPriority;
  instructions: string;
  payload: Record<string, unknown>;
  projectId?: string;
  acceptedAt: string;
}

export interface SystemBacklogQueueDeps {
  documentStore: IDocumentStore;
  healthSink: GatewayRuntimeHealthSink;
  executeEntry: (entry: BacklogEntry) => Promise<AgentResult>;
  now: () => string;
  config?: Partial<BacklogQueueConfig>;
}

export class SystemBacklogQueue {
  private readonly store: DocumentBacklogStore;
  private readonly config: BacklogQueueConfig;
  private readonly ready: Promise<void>;
  private promotionInFlight = false;
  private readonly idleWaiters = new Set<() => void>();

  constructor(private readonly deps: SystemBacklogQueueDeps) {
    this.store = new DocumentBacklogStore(deps.documentStore);
    this.config = BacklogQueueConfigSchema.parse(deps.config ?? {});
    this.ready = this.initialize();
  }

  async enqueue(submission: SystemBacklogSubmission): Promise<BacklogEntry> {
    await this.ready;
    const analytics = await this.store.snapshotAnalytics(this.deps.now(), this.config);
    const entry = BacklogEntrySchema.parse({
      id: submission.id,
      status: 'queued',
      source: submission.source,
      priority: submission.priority,
      priorityRank: toBacklogPriorityRank(submission.priority),
      instructions: submission.instructions,
      payload: submission.payload,
      projectId: submission.projectId,
      dispatchRef: submission.dispatchRef,
      runId: submission.runId,
      acceptedAt: submission.acceptedAt,
      queueDepthAtAcceptance:
        analytics.queuedCount + analytics.activeCount + analytics.suspendedCount,
    });

    await this.store.put(entry);
    this.deps.healthSink.recordSubmission(submission.source, submission.acceptedAt);
    await this.refreshAnalytics();
    void this.promote();
    return entry;
  }

  async whenIdle(): Promise<void> {
    await this.ready;
    if (await this.isIdle()) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.idleWaiters.add(resolve);
    });
  }

  async notifyLeaseReleased(criteria?: {
    laneKey?: string;
    leaseId?: string;
  }): Promise<void> {
    await this.ready;
    await this.store.requeueSuspended(criteria);
    await this.refreshAnalytics();
    void this.promote();
  }

  async getAnalytics(): Promise<BacklogAnalytics> {
    await this.ready;
    return this.store.snapshotAnalytics(this.deps.now(), this.config);
  }

  async listEntries(filter?: { status?: BacklogEntryStatus }): Promise<BacklogEntry[]> {
    await this.ready;
    if (filter?.status) {
      return this.store.listByStatus(filter.status);
    }
    return this.store.list();
  }

  private async initialize(): Promise<void> {
    const resetCount = await this.store.resetActiveToQueued();
    if (resetCount > 0) {
      console.warn(`Backlog recovery: ${resetCount} entries reset from active to queued.`);
      this.deps.healthSink.addIssue('backlog_recovery_reset', 'Cortex::System');
    } else {
      console.info('Backlog recovery: 0 entries reset from active to queued.');
    }
    await this.refreshAnalytics();
    void this.promote();
  }

  private async promote(): Promise<void> {
    await this.ready;
    if (this.promotionInFlight) {
      return;
    }

    this.promotionInFlight = true;
    try {
      while (true) {
        const analytics = await this.store.snapshotAnalytics(this.deps.now(), this.config);
        if (analytics.activeCount >= this.config.activeCapacity) {
          return;
        }

        const queued = (await this.store.listByStatus('queued')).sort(compareBacklogEntries);
        const next = queued[0];
        if (!next) {
          this.resolveIdleWaitersIfNeeded(analytics);
          return;
        }

        const promotedAt = this.deps.now();
        const activeEntry = await this.store.transition(next.id, 'active', { promotedAt });
        await this.refreshAnalytics();

        if (activeEntry) {
          void this.execute(activeEntry);
        }
      }
    } finally {
      this.promotionInFlight = false;
    }
  }

  private async execute(entry: BacklogEntry): Promise<void> {
    try {
      const result = AgentResultSchema.parse(await this.deps.executeEntry(entry));
      if (result.status === 'suspended') {
        await this.store.transition(entry.id, 'suspended', {
          resultStatus: 'suspended',
          lastErrorCode: 'LEASE_HELD',
          lastErrorMessage: result.reason,
          suspensionDetail: result.detail,
        });
      } else if (result.status === 'error') {
        await this.store.transition(entry.id, 'failed', {
          completedAt: this.deps.now(),
          resultStatus: 'error',
          lastErrorCode: 'SYSTEM_RUNTIME_ERROR',
          lastErrorMessage: result.reason,
        });
      } else {
        await this.store.transition(entry.id, 'completed', {
          completedAt: this.deps.now(),
          resultStatus: result.status,
          suspensionDetail: undefined,
          lastErrorCode: undefined,
          lastErrorMessage: undefined,
        });
      }

      this.deps.healthSink.completeSubmission(result);
    } catch (error) {
      await this.store.transition(entry.id, 'failed', {
        completedAt: this.deps.now(),
        resultStatus: 'error',
        lastErrorCode: 'BACKLOG_EXECUTION_FAILED',
        lastErrorMessage: error instanceof Error ? error.message : String(error),
      });
      this.deps.healthSink.completeSubmission({ status: 'error' });
      this.deps.healthSink.addIssue('system_submission_queue_failed', 'Cortex::System');
    } finally {
      const retentionStart = new Date(
        Date.parse(this.deps.now()) - this.config.retentionWindowMs,
      ).toISOString();
      await this.store.pruneRetained(retentionStart);
      const analytics = await this.refreshAnalytics();
      this.resolveIdleWaitersIfNeeded(analytics);
      void this.promote();
    }
  }

  private async refreshAnalytics(): Promise<BacklogAnalytics> {
    const analytics = await this.store.snapshotAnalytics(this.deps.now(), this.config);
    this.deps.healthSink.updateBacklogAnalytics(analytics);
    return analytics;
  }

  private async isIdle(): Promise<boolean> {
    const analytics = await this.store.snapshotAnalytics(this.deps.now(), this.config);
    return (
      analytics.queuedCount === 0 &&
      analytics.activeCount === 0 &&
      analytics.suspendedCount === 0
    );
  }

  private resolveIdleWaitersIfNeeded(analytics: BacklogAnalytics): void {
    if (
      analytics.queuedCount > 0 ||
      analytics.activeCount > 0 ||
      analytics.suspendedCount > 0
    ) {
      return;
    }

    for (const resolve of this.idleWaiters) {
      resolve();
    }
    this.idleWaiters.clear();
  }
}
