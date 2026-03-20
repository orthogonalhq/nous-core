import type {
  AppProjectConfigDocument,
  IDocumentStore,
  ProjectId,
} from '@nous/shared';
import { AppProjectConfigDocumentSchema } from '@nous/shared';

const COLLECTION = 'app_project_config';

export class AppConfigVersionConflictError extends Error {
  constructor(
    public readonly currentVersion: string,
    public readonly expectedVersion: string,
  ) {
    super(
      `App config version conflict: expected ${expectedVersion}, current ${currentVersion}.`,
    );
    this.name = 'AppConfigVersionConflictError';
  }
}

function buildDocumentId(projectId: ProjectId, packageId: string): string {
  return `${projectId}:${packageId}`;
}

export class DocumentAppConfigStore {
  constructor(private readonly documentStore: IDocumentStore) {}

  async get(
    projectId: ProjectId,
    packageId: string,
  ): Promise<AppProjectConfigDocument | null> {
    const record = await this.documentStore.get<unknown>(
      COLLECTION,
      buildDocumentId(projectId, packageId),
    );
    if (!record) {
      return null;
    }

    const parsed = AppProjectConfigDocumentSchema.safeParse(record);
    return parsed.success ? parsed.data : null;
  }

  async put(
    document: AppProjectConfigDocument,
    options?: { expectedConfigVersion?: string },
  ): Promise<AppProjectConfigDocument> {
    const parsed = AppProjectConfigDocumentSchema.parse(document);
    if (options?.expectedConfigVersion) {
      const current = await this.get(parsed.project_id, parsed.package_id);
      if (current && current.config_version !== options.expectedConfigVersion) {
        throw new AppConfigVersionConflictError(
          current.config_version,
          options.expectedConfigVersion,
        );
      }
    }
    await this.documentStore.put(
      COLLECTION,
      buildDocumentId(parsed.project_id, parsed.package_id),
      parsed,
    );
    return parsed;
  }

  async delete(projectId: ProjectId, packageId: string): Promise<boolean> {
    return this.documentStore.delete(COLLECTION, buildDocumentId(projectId, packageId));
  }
}

