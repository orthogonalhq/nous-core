/**
 * MwcPipeline — MemoryWriteCandidate flow: create → evaluate → persist.
 *
 * Also provides export and delete for project-scoped memory.
 */
import { randomUUID } from 'node:crypto';
import type {
  IDocumentStore,
  IStmStore,
  MemoryWriteCandidate,
  MemoryEntry,
  MemoryEntryId,
  ProjectId,
  StmContext,
} from '@nous/shared';
import {
  MemoryWriteCandidateSchema,
  MemoryEntrySchema,
  ValidationError,
} from '@nous/shared';
import type { MwcEvaluator } from './evaluator.js';

const COLLECTION = 'memory_entries';

function candidateToEntry(
  candidate: MemoryWriteCandidate,
  projectId?: ProjectId,
): MemoryEntry {
  const now = new Date().toISOString();
  const id = randomUUID() as MemoryEntryId;
  const entryProjectId = projectId ?? candidate.projectId;

  return {
    id,
    content: candidate.content,
    type: candidate.type,
    scope: candidate.scope,
    projectId: entryProjectId,
    confidence: candidate.confidence,
    sensitivity: candidate.sensitivity,
    retention: candidate.retention,
    provenance: candidate.provenance,
    sentiment: candidate.sentiment,
    tags: candidate.tags,
    createdAt: now,
    updatedAt: now,
    supersededBy: undefined,
    embedding: undefined,
  };
}

export class MwcPipeline {
  constructor(
    private readonly documentStore: IDocumentStore,
    private readonly stmStore: IStmStore,
    private readonly evaluator: MwcEvaluator,
  ) {}

  async submit(
    candidate: MemoryWriteCandidate,
    projectId?: ProjectId,
  ): Promise<MemoryEntryId | null> {
    const parseResult = MemoryWriteCandidateSchema.safeParse(candidate);
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      }));
      throw new ValidationError('Invalid MemoryWriteCandidate', errors);
    }
    const validated = parseResult.data;
    const evalResult = await this.evaluator(validated, projectId);

    if (!evalResult.approved) {
      console.info(
        `[nous:mwc] denied projectId=${projectId ?? 'global'} reason=${evalResult.reason ?? 'unspecified'}`,
      );
      return null;
    }

    const entry = candidateToEntry(validated, projectId);
    await this.documentStore.put(COLLECTION, entry.id, entry);

    console.info(
      `[nous:mwc] persisted projectId=${entry.projectId ?? 'global'} entryId=${entry.id}`,
    );
    return entry.id;
  }

  async listForProject(projectId: ProjectId): Promise<MemoryEntry[]> {
    const raw = await this.documentStore.query<Record<string, unknown>>(
      COLLECTION,
      { where: { projectId } },
    );

    const entries: MemoryEntry[] = [];
    for (const item of raw) {
      const parsed = MemoryEntrySchema.safeParse(item);
      if (parsed.success) {
        entries.push(parsed.data);
      }
    }

    return entries;
  }

  async exportForProject(
    projectId: ProjectId,
  ): Promise<{ stm: StmContext; entries: MemoryEntry[] }> {
    const stm = await this.stmStore.getContext(projectId);
    const raw = await this.documentStore.query<Record<string, unknown>>(
      COLLECTION,
      { where: { projectId } },
    );

    const entries: MemoryEntry[] = [];
    for (const item of raw) {
      const parsed = MemoryEntrySchema.safeParse(item);
      if (parsed.success) {
        entries.push(parsed.data);
      }
    }

    console.debug(
      `[nous:memory] export projectId=${projectId} entries=${entries.length}`,
    );
    return { stm, entries };
  }

  async deleteEntry(id: MemoryEntryId): Promise<boolean> {
    const result = await this.documentStore.delete(COLLECTION, id);
    console.info(`[nous:memory] delete entryId=${id} result=${result}`);
    return result;
  }

  async deleteAllForProject(projectId: ProjectId): Promise<number> {
    const raw = await this.documentStore.query<Record<string, unknown>>(
      COLLECTION,
      { where: { projectId } },
    );

    let count = 0;
    for (const item of raw) {
      const parsed = MemoryEntrySchema.safeParse(item);
      if (parsed.success) {
        await this.documentStore.delete(COLLECTION, parsed.data.id);
        count++;
      }
    }

    await this.stmStore.clear(projectId);
    console.info(
      `[nous:memory] deleteAllForProject projectId=${projectId} count=${count}`,
    );
    return count;
  }
}
