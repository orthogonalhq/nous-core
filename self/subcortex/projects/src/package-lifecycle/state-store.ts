import {
  PackageLifecycleStateRecordSchema,
  type PackageLifecycleStateRecord,
} from '@nous/shared';

export class LifecycleStateConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LifecycleStateConflictError';
  }
}

const buildKey = (projectId: string, packageId: string): string =>
  `${projectId}::${packageId}`;

const cloneRecord = (record: PackageLifecycleStateRecord): PackageLifecycleStateRecord =>
  structuredClone(record);

export class InMemoryPackageLifecycleStateStore {
  private readonly records = new Map<string, PackageLifecycleStateRecord>();

  async get(
    projectId: string,
    packageId: string,
  ): Promise<PackageLifecycleStateRecord | null> {
    const key = buildKey(projectId, packageId);
    const existing = this.records.get(key);
    if (!existing) {
      return null;
    }
    return cloneRecord(existing);
  }

  async upsert(
    record: PackageLifecycleStateRecord,
    expectedVersion?: number,
  ): Promise<PackageLifecycleStateRecord> {
    const key = buildKey(record.project_id, record.package_id);
    const existing = this.records.get(key);

    if (
      typeof expectedVersion === 'number' &&
      (!existing || existing.version !== expectedVersion)
    ) {
      throw new LifecycleStateConflictError(
        `Lifecycle state version conflict for ${record.project_id}/${record.package_id}`,
      );
    }

    const validated = PackageLifecycleStateRecordSchema.parse(record);
    this.records.set(key, validated);
    return cloneRecord(validated);
  }

  async delete(projectId: string, packageId: string): Promise<void> {
    const key = buildKey(projectId, packageId);
    this.records.delete(key);
  }
}
