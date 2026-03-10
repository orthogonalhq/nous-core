/**
 * Meta-vector service — search and upsert from distilled patterns.
 *
 * Phase 6.2: searchSimilarProjects returns ranked ProjectIds by meta-vector similarity.
 */
import type { ProjectId, ProjectMetaVector, Phase6DistilledPatternExport } from '@nous/shared';
import type { IMetaVectorStore } from './meta-vector-store.js';
import type { IEmbedder } from '@nous/shared';

export interface MetaVectorServiceDeps {
  store: IMetaVectorStore;
  embedder: IEmbedder;
}

export interface MetaVectorRefreshOptions {
  evidenceRefs?: ProjectMetaVector['evidenceRefs'];
  inputDigest?: ProjectMetaVector['inputDigest'];
  refreshRecordId?: ProjectMetaVector['refreshRecordId'];
  now?: string;
}

export interface MetaVectorRefreshResult {
  state: 'updated' | 'deleted' | 'unchanged';
  metaVector: ProjectMetaVector | null;
}

export class MetaVectorService {
  constructor(private readonly deps: MetaVectorServiceDeps) {}

  async searchSimilarProjects(
    queryVector: number[],
    topK: number,
  ): Promise<ProjectId[]> {
    const results = await this.deps.store.search(queryVector, topK);
    return results.map((r) => r.projectId);
  }

  async upsertFromPatterns(
    projectId: ProjectId,
    patterns: Phase6DistilledPatternExport[],
  ): Promise<void> {
    await this.refreshFromPatterns(projectId, patterns);
  }

  async get(projectId: ProjectId): Promise<ProjectMetaVector | null> {
    return this.deps.store.get(projectId);
  }

  async refreshFromPatterns(
    projectId: ProjectId,
    patterns: Phase6DistilledPatternExport[],
    options: MetaVectorRefreshOptions = {},
  ): Promise<MetaVectorRefreshResult> {
    if (patterns.length === 0) {
      const existing = await this.deps.store.get(projectId);
      if (!existing) {
        return {
          state: 'unchanged',
          metaVector: null,
        };
      }
      await this.deps.store.delete(projectId);
      return {
        state: 'deleted',
        metaVector: null,
      };
    }

    const content = patterns.map((p) => p.content).join('\n\n');
    const vector = await this.deps.embedder.embed(content);
    const now = options.now ?? new Date().toISOString();
    const existing = await this.deps.store.get(projectId);
    const metaVector: ProjectMetaVector = {
      projectId,
      vector,
      basedOn: patterns.map((p) => p.id),
      evidenceRefs:
        options.evidenceRefs ??
        patterns.flatMap((pattern) => pattern.evidenceRefs),
      inputDigest: options.inputDigest,
      refreshRecordId: options.refreshRecordId,
      updatedAt: now,
      createdAt: existing?.createdAt ?? now,
    };
    await this.deps.store.upsert(metaVector);
    return {
      state: 'updated',
      metaVector,
    };
  }
}
