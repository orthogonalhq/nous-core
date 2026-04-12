import type {
  IDocumentStore,
  NotificationFilter,
  NotificationRecord,
  NotificationStatus,
} from '@nous/shared';
import { NotificationRecordSchema } from '@nous/shared';
import type { z } from 'zod';

export const NOTIFICATION_COLLECTION = 'notifications';

export class DocumentNotificationStore {
  constructor(private readonly store: IDocumentStore) {}

  async save(record: NotificationRecord): Promise<void> {
    const validated = NotificationRecordSchema.parse(record);
    await this.store.put(NOTIFICATION_COLLECTION, validated.id, validated);
  }

  async get(id: string): Promise<NotificationRecord | null> {
    const raw = await this.store.get<unknown>(NOTIFICATION_COLLECTION, id);
    if (!raw) return null;
    const parsed = NotificationRecordSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }

  async query(filter: NotificationFilter): Promise<NotificationRecord[]> {
    const where: Record<string, unknown> = {};
    if (filter.projectId !== undefined) where.projectId = filter.projectId;
    if (filter.kind !== undefined) where.kind = filter.kind;
    if (filter.status !== undefined) where.status = filter.status;
    if (filter.transient !== undefined) where.transient = filter.transient;
    if (filter.level !== undefined) where.level = filter.level;

    const results = await this.store.query<unknown>(NOTIFICATION_COLLECTION, {
      where,
      orderBy: 'createdAt',
      orderDirection: 'desc',
      limit: filter.limit ?? 50,
      offset: filter.offset ?? 0,
    });

    return results
      .map((raw) => NotificationRecordSchema.safeParse(raw))
      .filter(
        (r): r is z.SafeParseSuccess<NotificationRecord> => r.success,
      )
      .map((r) => r.data);
  }

  async countByStatus(
    status: NotificationStatus,
    projectId?: string,
  ): Promise<number> {
    const where: Record<string, unknown> = { status };
    if (projectId !== undefined) where.projectId = projectId;

    const results = await this.store.query<unknown>(
      NOTIFICATION_COLLECTION,
      { where },
    );
    return results.length;
  }

  async deleteExpiredTransient(olderThanMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMs).toISOString();
    const candidates = await this.store.query<unknown>(
      NOTIFICATION_COLLECTION,
      {
        where: { transient: true, status: 'dismissed' },
      },
    );

    let deleted = 0;
    for (const raw of candidates) {
      const parsed = NotificationRecordSchema.safeParse(raw);
      if (parsed.success && parsed.data.updatedAt < cutoff) {
        await this.store.delete(NOTIFICATION_COLLECTION, parsed.data.id);
        deleted++;
      }
    }
    return deleted;
  }
}
