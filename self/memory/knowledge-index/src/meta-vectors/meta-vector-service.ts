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
    if (patterns.length === 0) return;
    const content = patterns.map((p) => p.content).join('\n\n');
    const vector = await this.deps.embedder.embed(content);
    const now = new Date().toISOString();
    const metaVector: ProjectMetaVector = {
      projectId,
      vector,
      basedOn: patterns.map((p) => p.id),
      updatedAt: now,
      createdAt: now,
    };
    await this.deps.store.upsert(metaVector);
  }

  async get(projectId: ProjectId): Promise<ProjectMetaVector | null> {
    return this.deps.store.get(projectId);
  }
}
