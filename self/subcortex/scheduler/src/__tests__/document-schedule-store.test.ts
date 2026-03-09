import { describe, expect, it } from 'vitest';
import type { DocumentFilter, IDocumentStore } from '@nous/shared';
import { DocumentScheduleStore } from '../document-schedule-store.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655441001';
const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655441002';

function createMemoryDocumentStore(): IDocumentStore {
  const collections = new Map<string, Map<string, unknown>>();

  const getCollection = (name: string): Map<string, unknown> => {
    const existing = collections.get(name);
    if (existing) {
      return existing;
    }
    const created = new Map<string, unknown>();
    collections.set(name, created);
    return created;
  };

  return {
    async put<T>(collection: string, id: string, document: T): Promise<void> {
      getCollection(collection).set(id, document);
    },
    async get<T>(collection: string, id: string): Promise<T | null> {
      return (getCollection(collection).get(id) as T | undefined) ?? null;
    },
    async query<T>(collection: string, filter: DocumentFilter): Promise<T[]> {
      const rows = Array.from(getCollection(collection).values())
        .filter((row) =>
          Object.entries(filter.where ?? {}).every(
            ([key, value]) => (row as Record<string, unknown>)[key] === value,
          ),
        )
        .sort((left, right) =>
          filter.orderBy == null
            ? 0
            : String((left as Record<string, unknown>)[filter.orderBy]).localeCompare(
                String((right as Record<string, unknown>)[filter.orderBy]),
              ),
        );
      return rows as T[];
    },
    async delete(collection: string, id: string): Promise<boolean> {
      return getCollection(collection).delete(id);
    },
  };
}

function createSchedule(overrides: Record<string, unknown> = {}) {
  return {
    id: '550e8400-e29b-41d4-a716-446655441010',
    projectId: PROJECT_ID,
    workflowDefinitionId: WORKFLOW_ID,
    workmodeId: 'system:implementation',
    trigger: {
      kind: 'cron' as const,
      cron: '*/15 * * * *',
    },
    enabled: true,
    requestedDeliveryMode: 'none' as const,
    nextDueAt: '2026-03-08T00:15:00.000Z',
    createdAt: '2026-03-08T00:00:00.000Z',
    updatedAt: '2026-03-08T00:00:00.000Z',
    ...overrides,
  };
}

describe('DocumentScheduleStore', () => {
  it('persists schedules and lists them by project', async () => {
    const store = new DocumentScheduleStore(createMemoryDocumentStore());
    await store.save(createSchedule() as any);

    const listed = await store.listByProject(PROJECT_ID as any);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.workflowDefinitionId).toBe(WORKFLOW_ID);
  });

  it('returns due schedules in nextDueAt order', async () => {
    const store = new DocumentScheduleStore(createMemoryDocumentStore());
    await store.save(createSchedule({
      id: '550e8400-e29b-41d4-a716-446655441011',
      nextDueAt: '2026-03-08T00:20:00.000Z',
    }) as any);
    await store.save(createSchedule({
      id: '550e8400-e29b-41d4-a716-446655441012',
      nextDueAt: '2026-03-08T00:10:00.000Z',
    }) as any);

    const due = await store.listDue('2026-03-08T00:30:00.000Z');
    expect(due.map((schedule) => schedule.id)).toEqual([
      '550e8400-e29b-41d4-a716-446655441012',
      '550e8400-e29b-41d4-a716-446655441011',
    ]);
  });

  it('cancels schedules by disabling them and clearing nextDueAt', async () => {
    const store = new DocumentScheduleStore(createMemoryDocumentStore());
    await store.save(createSchedule() as any);

    const cancelled = await store.cancel(
      '550e8400-e29b-41d4-a716-446655441010',
      '2026-03-08T01:00:00.000Z',
    );

    expect(cancelled).toBe(true);
    const persisted = await store.get('550e8400-e29b-41d4-a716-446655441010');
    expect(persisted?.enabled).toBe(false);
    expect(persisted?.nextDueAt).toBeNull();
  });
});
