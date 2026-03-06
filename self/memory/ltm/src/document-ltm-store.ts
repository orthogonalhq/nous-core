import type {
  IDocumentStore,
  ILtmStore,
  MemoryEntry,
  MemoryEntryId,
  MemoryLifecycleStatus,
  MemoryMutationAuditRecord,
  MemoryQueryFilter,
  MemoryTombstone,
  MemoryTombstoneId,
  ProjectId,
} from '@nous/shared';
import {
  MemoryEntrySchema,
  MemoryMutationAuditRecordSchema,
  MemoryQueryFilterSchema,
  MemoryTombstoneSchema,
  ValidationError,
} from '@nous/shared';

export const MEMORY_ENTRY_COLLECTION = 'memory_entries';
export const MEMORY_MUTATION_AUDIT_COLLECTION = 'memory_mutation_audit';
export const MEMORY_TOMBSTONE_COLLECTION = 'memory_tombstones';

export interface DocumentLtmStoreOptions {
  now?: () => string;
}

export type AppendAuditRecordInput = Omit<MemoryMutationAuditRecord, 'sequence'> & {
  sequence?: number;
};

type LifecycleAwareMemoryQueryFilter = MemoryQueryFilter & {
  lifecycleStatus?: MemoryEntry['lifecycleStatus'];
  placementState?: MemoryEntry['placementState'];
  includeSuperseded?: boolean;
  includeDeleted?: boolean;
};

export class DocumentLtmStore implements ILtmStore {
  private readonly now: () => string;

  constructor(
    private readonly documentStore: IDocumentStore,
    options: DocumentLtmStoreOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async write(entry: MemoryEntry): Promise<MemoryEntryId> {
    const parsed = MemoryEntrySchema.safeParse(entry);
    if (!parsed.success) {
      throw toValidationError('Invalid MemoryEntry', parsed.error.errors);
    }

    await this.documentStore.put(
      MEMORY_ENTRY_COLLECTION,
      parsed.data.id,
      parsed.data,
    );
    return parsed.data.id;
  }

  async read(id: MemoryEntryId): Promise<MemoryEntry | null> {
    const raw = await this.documentStore.get<Record<string, unknown>>(
      MEMORY_ENTRY_COLLECTION,
      id,
    );
    if (!raw) {
      return null;
    }

    const parsed = MemoryEntrySchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }

  async query(filter: MemoryQueryFilter): Promise<MemoryEntry[]> {
    const parsed = MemoryQueryFilterSchema.safeParse(filter);
    if (!parsed.success) {
      throw toValidationError('Invalid MemoryQueryFilter', parsed.error.errors);
    }

    const normalized = parsed.data as LifecycleAwareMemoryQueryFilter;
    const raw = await this.documentStore.query<Record<string, unknown>>(
      MEMORY_ENTRY_COLLECTION,
      buildDocumentFilter(normalized),
    );

    const matches = raw
      .map((item) => MemoryEntrySchema.safeParse(item))
      .filter((result): result is { success: true; data: MemoryEntry } => result.success)
      .map((result) => result.data)
      .filter((entry) => matchesFilter(entry, normalized))
      .sort(sortEntries);

    const offset = normalized.offset ?? 0;
    const limit = normalized.limit ?? matches.length;
    return matches.slice(offset, offset + limit);
  }

  async delete(id: MemoryEntryId): Promise<boolean> {
    return this.documentStore.delete(MEMORY_ENTRY_COLLECTION, id);
  }

  async export(filter: MemoryQueryFilter): Promise<MemoryEntry[]> {
    return this.query(filter);
  }

  async markSuperseded(
    ids: MemoryEntryId[],
    supersededBy: MemoryEntryId,
  ): Promise<void> {
    const updatedAt = this.now();
    for (const id of ids) {
      const entry = await this.read(id);
      if (!entry) {
        continue;
      }

      await this.write({
        ...entry,
        lifecycleStatus: 'superseded',
        supersededBy,
        updatedAt,
      });
    }
  }

  async listForProject(
    projectId: ProjectId,
    options: {
      includeSuperseded?: boolean;
      includeDeleted?: boolean;
    } = {},
  ): Promise<MemoryEntry[]> {
    return this.query({
      projectId,
      includeSuperseded: options.includeSuperseded ?? true,
      includeDeleted: options.includeDeleted ?? true,
    } as MemoryQueryFilter);
  }

  async appendAuditRecord(
    record: AppendAuditRecordInput,
  ): Promise<MemoryMutationAuditRecord> {
    const sequence = record.sequence ?? (await this.nextAuditSequence());
    const parsed = MemoryMutationAuditRecordSchema.safeParse({
      ...record,
      sequence,
    });
    if (!parsed.success) {
      throw toValidationError(
        'Invalid MemoryMutationAuditRecord',
        parsed.error.errors,
      );
    }

    await this.documentStore.put(
      MEMORY_MUTATION_AUDIT_COLLECTION,
      parsed.data.id,
      parsed.data,
    );
    return parsed.data;
  }

  async listMutationAudit(
    projectId?: ProjectId,
  ): Promise<MemoryMutationAuditRecord[]> {
    const raw = await this.documentStore.query<Record<string, unknown>>(
      MEMORY_MUTATION_AUDIT_COLLECTION,
      projectId ? { where: { projectId } } : {},
    );

    return raw
      .map((item) => MemoryMutationAuditRecordSchema.safeParse(item))
      .filter(
        (result): result is { success: true; data: MemoryMutationAuditRecord } =>
          result.success,
      )
      .map((result) => result.data)
      .sort((a, b) => a.sequence - b.sequence);
  }

  async createTombstone(tombstone: MemoryTombstone): Promise<MemoryTombstoneId> {
    const parsed = MemoryTombstoneSchema.safeParse(tombstone);
    if (!parsed.success) {
      throw toValidationError('Invalid MemoryTombstone', parsed.error.errors);
    }

    await this.documentStore.put(
      MEMORY_TOMBSTONE_COLLECTION,
      parsed.data.id,
      parsed.data,
    );
    return parsed.data.id;
  }

  async listTombstones(projectId?: ProjectId): Promise<MemoryTombstone[]> {
    const raw = await this.documentStore.query<Record<string, unknown>>(
      MEMORY_TOMBSTONE_COLLECTION,
      projectId ? { where: { projectId } } : {},
    );

    return raw
      .map((item) => MemoryTombstoneSchema.safeParse(item))
      .filter((result): result is { success: true; data: MemoryTombstone } => result.success)
      .map((result) => result.data)
      .sort((a, b) => {
        if (a.createdAt === b.createdAt) {
          return a.id.localeCompare(b.id);
        }
        return a.createdAt.localeCompare(b.createdAt);
      });
  }

  private async nextAuditSequence(): Promise<number> {
    const records = await this.listMutationAudit();
    if (!records.length) {
      return 1;
    }
    return records[records.length - 1].sequence + 1;
  }
}

function buildDocumentFilter(filter: LifecycleAwareMemoryQueryFilter): {
  where?: Record<string, unknown>;
} {
  const where: Record<string, unknown> = {};
  if (filter.type != null) {
    where.type = filter.type;
  }
  if (filter.scope != null) {
    where.scope = filter.scope;
  }
  if (filter.projectId != null) {
    where.projectId = filter.projectId;
  }
  if (filter.placementState != null) {
    where.placementState = filter.placementState;
  }

  return Object.keys(where).length > 0 ? { where } : {};
}

function matchesFilter(
  entry: MemoryEntry,
  filter: LifecycleAwareMemoryQueryFilter,
): boolean {
  if (filter.type != null && entry.type !== filter.type) {
    return false;
  }
  if (filter.scope != null && entry.scope !== filter.scope) {
    return false;
  }
  if (filter.projectId != null && entry.projectId !== filter.projectId) {
    return false;
  }
  if (filter.tags != null && filter.tags.length > 0) {
    const tags = new Set(entry.tags);
    if (!filter.tags.every((tag) => tags.has(tag))) {
      return false;
    }
  }
  if (filter.placementState != null && entry.placementState !== filter.placementState) {
    return false;
  }
  if (filter.fromDate != null && entry.updatedAt < filter.fromDate) {
    return false;
  }
  if (filter.toDate != null && entry.updatedAt > filter.toDate) {
    return false;
  }

  const allowedStatuses = resolveAllowedLifecycleStatuses(filter);
  return allowedStatuses.has(entry.lifecycleStatus);
}

function resolveAllowedLifecycleStatuses(
  filter: LifecycleAwareMemoryQueryFilter,
): Set<MemoryLifecycleStatus> {
  if (filter.lifecycleStatus != null) {
    return new Set([filter.lifecycleStatus]);
  }

  const statuses: MemoryLifecycleStatus[] = ['active'];
  if (filter.includeSuperseded) {
    statuses.push('superseded');
  }
  if (filter.includeDeleted) {
    statuses.push('soft-deleted', 'hard-deleted');
  }

  return new Set(statuses);
}

function sortEntries(a: MemoryEntry, b: MemoryEntry): number {
  if (a.updatedAt === b.updatedAt) {
    return a.id.localeCompare(b.id);
  }
  return a.updatedAt.localeCompare(b.updatedAt);
}

function toValidationError(
  message: string,
  errors: Array<{ path: (string | number)[]; message: string }>,
): ValidationError {
  return new ValidationError(
    message,
    errors.map((error) => ({
      path: error.path.join('.'),
      message: error.message,
    })),
  );
}
