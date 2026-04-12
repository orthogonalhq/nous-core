import { randomUUID } from 'node:crypto';
import type {
  IEventBus,
  INotificationService,
  NotificationLevel,
  NotificationRecord,
  NotificationFilter,
  RaiseNotificationInput,
} from '@nous/shared';
import { NotificationRecordSchema } from '@nous/shared';
import { DocumentNotificationStore } from './document-notification-store.js';

export interface NotificationServiceOptions {
  notificationStore: DocumentNotificationStore;
  eventBus?: IEventBus;
  now?: () => Date;
}

export class NotificationService implements INotificationService {
  constructor(private readonly options: NotificationServiceOptions) {}

  async raise(input: RaiseNotificationInput): Promise<NotificationRecord> {
    // 1. Dedup check: same source + title + projectId + kind, status active, within 60s
    const deduped = await this.findDuplicate(input);
    if (deduped) return deduped;

    // 2. Construct full record
    const now = (this.options.now ?? (() => new Date()))().toISOString();
    const record = NotificationRecordSchema.parse({
      ...input,
      id: randomUUID(),
      level: this.deriveLevel(input),
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });

    // 3. Persist
    await this.options.notificationStore.save(record);

    // 4. Publish (best-effort)
    this.options.eventBus?.publish('notification:raised', {
      id: record.id,
      kind: record.kind,
      projectId: record.projectId,
      level: record.level,
      title: record.title,
      source: record.source,
    });

    return record;
  }

  async acknowledge(id: string): Promise<NotificationRecord> {
    const existing = await this.options.notificationStore.get(id);
    if (!existing) throw new Error(`Notification ${id} not found`);
    if (
      existing.status === 'acknowledged' ||
      existing.status === 'dismissed'
    ) {
      return existing; // no-op for already-transitioned
    }

    const previousStatus = existing.status;
    const now = (this.options.now ?? (() => new Date()))().toISOString();
    const updated = NotificationRecordSchema.parse({
      ...existing,
      status: 'acknowledged',
      updatedAt: now,
    });

    await this.options.notificationStore.save(updated);
    this.options.eventBus?.publish('notification:updated', {
      id: updated.id,
      status: updated.status,
      previousStatus,
    });

    return updated;
  }

  async dismiss(id: string): Promise<NotificationRecord> {
    const existing = await this.options.notificationStore.get(id);
    if (!existing) throw new Error(`Notification ${id} not found`);
    if (existing.status === 'dismissed') {
      return existing; // no-op for already-dismissed
    }

    const previousStatus = existing.status;
    const now = (this.options.now ?? (() => new Date()))().toISOString();
    const updated = NotificationRecordSchema.parse({
      ...existing,
      status: 'dismissed',
      updatedAt: now,
    });

    await this.options.notificationStore.save(updated);
    this.options.eventBus?.publish('notification:updated', {
      id: updated.id,
      status: updated.status,
      previousStatus,
    });

    return updated;
  }

  async list(filter: NotificationFilter): Promise<NotificationRecord[]> {
    return this.options.notificationStore.query(filter);
  }

  async get(id: string): Promise<NotificationRecord | null> {
    return this.options.notificationStore.get(id);
  }

  async countActive(projectId?: string): Promise<number> {
    return this.options.notificationStore.countByStatus('active', projectId);
  }

  private deriveLevel(input: RaiseNotificationInput): NotificationLevel {
    switch (input.kind) {
      case 'escalation': {
        const map = {
          low: 'info',
          medium: 'warning',
          high: 'error',
          critical: 'critical',
        } as const;
        return map[input.escalation.severity];
      }
      case 'alert':
        return input.alert.category === 'budget-exceeded'
          ? 'error'
          : 'warning';
      case 'health':
        return input.health.severity;
      case 'panel': {
        const map = {
          info: 'info',
          success: 'info',
          warning: 'warning',
          error: 'error',
        } as const;
        return map[input.panel.level];
      }
      case 'toast':
        return input.toast.severity;
    }
  }

  private async findDuplicate(
    input: RaiseNotificationInput,
  ): Promise<NotificationRecord | null> {
    const cutoff = new Date(
      (this.options.now ?? (() => new Date()))().getTime() - 60_000,
    ).toISOString();
    const candidates = await this.options.notificationStore.query({
      kind: input.kind,
      status: 'active',
      ...(input.projectId ? { projectId: input.projectId } : {}),
      limit: 50,
    });

    return (
      candidates.find(
        (c) =>
          c.source === input.source &&
          c.title === input.title &&
          c.projectId === input.projectId &&
          c.createdAt >= cutoff,
      ) ?? null
    );
  }
}
