/**
 * DocumentStmStore — IStmStore implementation using IDocumentStore.
 *
 * STM stored as single document per project. Collection: stm_context.
 * Document ID: ProjectId.
 */
import { createHash, randomUUID } from 'node:crypto';
import type { IDocumentStore, IStmStore } from '@nous/shared';
import {
  StmContextSchema,
  StmCompactionSummarySchema,
  StmEntrySchema,
  ValidationError,
  type ProjectId,
  type StmContext,
  type StmEntry,
} from '@nous/shared';

const COLLECTION = 'stm_context';
const COMPACTION_COLLECTION = 'stm_compaction_summaries';
const MIN_ENTRIES_FOR_COMPACTION = 8;
const RETAINED_RECENT_ENTRIES = 4;

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
    const result = StmEntrySchema.safeParse(entry);
    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      }));
      throw new ValidationError('Invalid STM entry', errors);
    }
    const validated = result.data;

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

  async compact(projectId: ProjectId): Promise<void> {
    const context = await this.getContext(projectId);
    if (context.entries.length < MIN_ENTRIES_FOR_COMPACTION) {
      return;
    }

    const compactedEntries = context.entries.slice(
      0,
      context.entries.length - RETAINED_RECENT_ENTRIES,
    );
    const retainedEntries = context.entries.slice(-RETAINED_RECENT_ENTRIES);

    const summaryText = compactedEntries
      .map((entry) => `${entry.role}: ${entry.content}`)
      .join('\n')
      .slice(0, 4000);

    const generatedAt = new Date().toISOString();
    const summaryRecord = StmCompactionSummarySchema.parse({
      id: randomUUID(),
      projectId,
      summary: summaryText,
      sourceEntryRefs: compactedEntries.map((entry) => ({
        timestamp: entry.timestamp,
        role: entry.role,
        contentHash: createHash('sha256').update(entry.content).digest('hex'),
      })),
      sourceEntryCount: compactedEntries.length,
      generatedAt,
    });

    await this.documentStore.put(
      COMPACTION_COLLECTION,
      summaryRecord.id,
      summaryRecord,
    );

    const mergedSummary = context.summary
      ? `${context.summary}\n\n${summaryText}`
      : summaryText;

    const updated: StmContext = {
      entries: retainedEntries,
      summary: mergedSummary,
      tokenCount:
        estimateTokenCount(mergedSummary) +
        retainedEntries.reduce(
          (total, entry) => total + estimateTokenCount(entry.content),
          0,
        ),
    };

    await this.documentStore.put(COLLECTION, projectId, updated);
    console.info(
      `[nous:stm] compact projectId=${projectId} compacted=${compactedEntries.length} retained=${retainedEntries.length}`,
    );
  }

  async clear(projectId: ProjectId): Promise<void> {
    await this.documentStore.delete(COLLECTION, projectId);
    console.info(`[nous:stm] clear projectId=${projectId}`);
  }
}
