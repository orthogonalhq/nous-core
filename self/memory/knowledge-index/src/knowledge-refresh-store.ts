import type {
  IDocumentStore,
  ProjectId,
  ProjectKnowledgeRefreshRecord,
} from '@nous/shared';
import { ProjectKnowledgeRefreshRecordSchema } from '@nous/shared';

export const KNOWLEDGE_REFRESH_RECORD_COLLECTION = 'knowledge_refresh_records';

function parseRefreshRecord(value: unknown): ProjectKnowledgeRefreshRecord | null {
  const parsed = ProjectKnowledgeRefreshRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export class KnowledgeRefreshStore {
  constructor(private readonly documentStore: IDocumentStore) {}

  async append(
    record: ProjectKnowledgeRefreshRecord,
  ): Promise<ProjectKnowledgeRefreshRecord> {
    const parsed = ProjectKnowledgeRefreshRecordSchema.parse(record);
    await this.documentStore.put(
      KNOWLEDGE_REFRESH_RECORD_COLLECTION,
      parsed.id,
      parsed,
    );
    return parsed;
  }

  async get(recordId: string): Promise<ProjectKnowledgeRefreshRecord | null> {
    const raw = await this.documentStore.get<unknown>(
      KNOWLEDGE_REFRESH_RECORD_COLLECTION,
      recordId,
    );
    return parseRefreshRecord(raw);
  }

  async listByProject(projectId: ProjectId): Promise<ProjectKnowledgeRefreshRecord[]> {
    const raw = await this.documentStore.query<unknown>(
      KNOWLEDGE_REFRESH_RECORD_COLLECTION,
      {
        where: { projectId },
      },
    );

    return raw
      .map(parseRefreshRecord)
      .filter(
        (record): record is ProjectKnowledgeRefreshRecord => record !== null,
      )
      .sort((left, right) => {
        if (left.completedAt === right.completedAt) {
          return left.id.localeCompare(right.id);
        }
        return right.completedAt.localeCompare(left.completedAt);
      });
  }

  async getLatestForProject(
    projectId: ProjectId,
  ): Promise<ProjectKnowledgeRefreshRecord | null> {
    const records = await this.listByProject(projectId);
    return records[0] ?? null;
  }

  async getLatestByProjectAndDigest(
    projectId: ProjectId,
    inputDigest: string,
  ): Promise<ProjectKnowledgeRefreshRecord | null> {
    const records = await this.listByProject(projectId);
    return records.find((record) => record.inputDigest === inputDigest) ?? null;
  }
}
