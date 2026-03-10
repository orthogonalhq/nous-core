import { describe, expect, it } from 'vitest';
import type { DocumentFilter, IDocumentStore } from '@nous/shared';
import { DocumentEscalationStore } from '../document-escalation-store.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440410';
const ESCALATION_ID = '550e8400-e29b-41d4-a716-446655440411';

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
            : String((right as Record<string, unknown>)[filter.orderBy]).localeCompare(
                String((left as Record<string, unknown>)[filter.orderBy]),
              ),
        );
      return rows as T[];
    },
    async delete(collection: string, id: string): Promise<boolean> {
      return getCollection(collection).delete(id);
    },
  };
}

function createEscalation(overrides: Record<string, unknown> = {}) {
  return {
    escalationId: ESCALATION_ID,
    projectId: PROJECT_ID,
    source: 'workflow',
    severity: 'high',
    title: 'Review required',
    message: 'A workflow review gate requires input.',
    status: 'visible',
    routeTargets: ['projects', 'chat'],
    requiredAction: 'Review and resume',
    evidenceRefs: ['evidence:workflow:blocked'],
    acknowledgements: [],
    createdAt: '2026-03-09T00:00:00.000Z',
    updatedAt: '2026-03-09T00:00:00.000Z',
    ...overrides,
  };
}

describe('DocumentEscalationStore', () => {
  it('persists escalation queue records and lists them by project', async () => {
    const store = new DocumentEscalationStore(createMemoryDocumentStore());
    await store.save(createEscalation() as any);

    const listed = await store.listByProject(PROJECT_ID as any);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.escalationId).toBe(ESCALATION_ID);
  });

  it('returns records ordered by updatedAt descending', async () => {
    const store = new DocumentEscalationStore(createMemoryDocumentStore());
    await store.save(createEscalation({
      escalationId: '550e8400-e29b-41d4-a716-446655440412',
      updatedAt: '2026-03-09T00:10:00.000Z',
    }) as any);
    await store.save(createEscalation({
      escalationId: '550e8400-e29b-41d4-a716-446655440413',
      updatedAt: '2026-03-09T00:20:00.000Z',
    }) as any);

    const listed = await store.listByProject(PROJECT_ID as any);
    expect(listed.map((item) => item.escalationId)).toEqual([
      '550e8400-e29b-41d4-a716-446655440413',
      '550e8400-e29b-41d4-a716-446655440412',
    ]);
  });
});
