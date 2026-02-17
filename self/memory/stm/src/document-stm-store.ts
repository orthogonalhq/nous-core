/**
 * DocumentStmStore — IStmStore implementation using IDocumentStore.
 *
 * STM stored as single document per project. Collection: stm_context.
 * Document ID: ProjectId.
 */
import type { IDocumentStore, IStmStore } from '@nous/shared';
import {
  StmContextSchema,
  StmEntrySchema,
  type ProjectId,
  type StmContext,
  type StmEntry,
} from '@nous/shared';

const COLLECTION = 'stm_context';

function estimateTokenCount(content: string): number {
  return Math.ceil(content.length / 4);
}

export class DocumentStmStore implements IStmStore {
  constructor(private readonly documentStore: IDocumentStore) {}

  async getContext(projectId: ProjectId): Promise<StmContext> {
    const raw = await this.documentStore.get<Record<string, unknown>>(
      COLLECTION,
      projectId,
    );
    if (!raw) {
      return { entries: [], tokenCount: 0 };
    }

    const result = StmContextSchema.safeParse(raw);
    if (!result.success) {
      return { entries: [], tokenCount: 0 };
    }

    console.debug(
      `[nous:stm] get_context projectId=${projectId} entries=${result.data.entries.length}`,
    );
    return result.data;
  }

  async append(projectId: ProjectId, entry: StmEntry): Promise<void> {
    const validated = StmEntrySchema.parse(entry);

    const context = await this.getContext(projectId);
    const newEntries = [...context.entries, validated];
    const tokenDelta = estimateTokenCount(validated.content);
    const newTokenCount = context.tokenCount + tokenDelta;

    const updated: StmContext = {
      entries: newEntries,
      summary: context.summary,
      tokenCount: newTokenCount,
    };

    await this.documentStore.put(COLLECTION, projectId, updated);
    console.debug(
      `[nous:stm] append projectId=${projectId} role=${validated.role} length=${validated.content.length}`,
    );
  }

  async compact(_projectId: ProjectId): Promise<void> {
    // No-op in Phase 1.4. Eviction deferred to Phase 2.
  }

  async clear(projectId: ProjectId): Promise<void> {
    await this.documentStore.delete(COLLECTION, projectId);
    console.info(`[nous:stm] clear projectId=${projectId}`);
  }
}
