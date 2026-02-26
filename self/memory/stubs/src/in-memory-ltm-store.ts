/**
 * InMemoryLtmStore — ILtmStore implementation for tests and benchmarks.
 *
 * Phase 4.2: Stores MemoryEntry in memory. Used when a real LTM backend is not available.
 */
import type {
  ILtmStore,
  MemoryEntry,
  MemoryEntryId,
  MemoryQueryFilter,
} from '@nous/shared';

function matchesFilter(entry: MemoryEntry, filter: MemoryQueryFilter): boolean {
  if (filter.type != null && entry.type !== filter.type) return false;
  if (filter.scope != null && entry.scope !== filter.scope) return false;
  if (filter.projectId != null && entry.projectId !== filter.projectId) return false;
  if (filter.tags != null && filter.tags.length > 0) {
    const entryTags = new Set(entry.tags);
    if (!filter.tags.every((t) => entryTags.has(t))) return false;
  }
  if (filter.fromDate != null && entry.updatedAt < filter.fromDate) return false;
  if (filter.toDate != null && entry.updatedAt > filter.toDate) return false;
  return true;
}

export class InMemoryLtmStore implements ILtmStore {
  private readonly entries = new Map<MemoryEntryId, MemoryEntry>();

  async write(entry: MemoryEntry): Promise<MemoryEntryId> {
    this.entries.set(entry.id, { ...entry });
    return entry.id;
  }

  async read(id: MemoryEntryId): Promise<MemoryEntry | null> {
    const entry = this.entries.get(id);
    return entry ? { ...entry } : null;
  }

  async query(filter: MemoryQueryFilter): Promise<MemoryEntry[]> {
    let results = [...this.entries.values()].filter((e) => matchesFilter(e, filter));
    results.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? results.length;
    return results.slice(offset, offset + limit).map((e) => ({ ...e }));
  }

  async delete(id: MemoryEntryId): Promise<boolean> {
    return this.entries.delete(id);
  }

  async export(filter: MemoryQueryFilter): Promise<MemoryEntry[]> {
    return this.query(filter);
  }

  async markSuperseded(
    ids: MemoryEntryId[],
    supersededBy: MemoryEntryId,
  ): Promise<void> {
    for (const id of ids) {
      const entry = this.entries.get(id);
      if (entry) {
        this.entries.set(id, {
          ...entry,
          supersededBy,
          lifecycleStatus: 'superseded',
        });
      }
    }
  }
}
