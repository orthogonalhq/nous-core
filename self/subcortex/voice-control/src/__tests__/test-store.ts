import type { DocumentFilter, IDocumentStore } from '@nous/shared';

type StoredCollections = Map<string, Map<string, unknown>>;

function getCollection(
  collections: StoredCollections,
  collection: string,
): Map<string, unknown> {
  const found = collections.get(collection);
  if (found) {
    return found;
  }

  const created = new Map<string, unknown>();
  collections.set(collection, created);
  return created;
}

function matchesWhere(row: unknown, where?: Record<string, unknown>): boolean {
  if (!where) {
    return true;
  }

  return Object.entries(where).every(
    ([key, value]) => (row as Record<string, unknown>)[key] === value,
  );
}

function sortRows(
  rows: unknown[],
  orderBy?: string,
  orderDirection: 'asc' | 'desc' = 'asc',
): unknown[] {
  if (!orderBy) {
    return rows;
  }
  const sorted = [...rows].sort((left, right) => {
    const leftValue = (left as Record<string, unknown>)[orderBy];
    const rightValue = (right as Record<string, unknown>)[orderBy];
    if (leftValue === rightValue) {
      return 0;
    }
    if (leftValue == null) {
      return -1;
    }
    if (rightValue == null) {
      return 1;
    }
    return leftValue < rightValue ? -1 : 1;
  });
  return orderDirection === 'desc' ? sorted.reverse() : sorted;
}

export function createMemoryDocumentStore(): IDocumentStore {
  const collections: StoredCollections = new Map();

  return {
    async put<T>(collection: string, id: string, document: T): Promise<void> {
      getCollection(collections, collection).set(id, document);
    },

    async get<T>(collection: string, id: string): Promise<T | null> {
      const found = getCollection(collections, collection).get(id);
      return (found as T | undefined) ?? null;
    },

    async query<T>(collection: string, filter: DocumentFilter): Promise<T[]> {
      const rows = Array.from(getCollection(collections, collection).values()).filter((row) =>
        matchesWhere(row, filter.where),
      );
      const ordered = sortRows(rows, filter.orderBy, filter.orderDirection);
      const offset = filter.offset ?? 0;
      const limited =
        filter.limit == null
          ? ordered.slice(offset)
          : ordered.slice(offset, offset + filter.limit);
      return limited as T[];
    },

    async delete(collection: string, id: string): Promise<boolean> {
      return getCollection(collections, collection).delete(id);
    },
  };
}
