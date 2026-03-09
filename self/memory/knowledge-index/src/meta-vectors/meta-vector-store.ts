/**
 * Meta-vector store — IVectorStore-backed implementation.
 *
 * Phase 6.2: One embedding per project. Uses dedicated collection "meta-vectors".
 */
import type { IVectorStore } from '@nous/shared';
import type { ProjectId, ProjectMetaVector, MetaVectorSearchResult } from '@nous/shared';
import { ProjectMetaVectorSchema } from '@nous/shared';

const META_VECTORS_COLLECTION = 'meta-vectors';

/**
 * Phase 6.2/6.3: Embedder dimension for meta-vector zero-vector search.
 * Must align with IEmbedder output. Default 128; override if embedder differs.
 */
export const META_VECTOR_EMBEDDER_DIMS = 128;

export interface IMetaVectorStore {
  get(projectId: ProjectId): Promise<ProjectMetaVector | null>;
  upsert(metaVector: ProjectMetaVector): Promise<void>;
  search(queryVector: number[], topK: number): Promise<MetaVectorSearchResult[]>;
  delete(projectId: ProjectId): Promise<void>;
}

export interface MetaVectorStoreDeps {
  vectorStore: IVectorStore;
}

export class MetaVectorStore implements IMetaVectorStore {
  constructor(private readonly deps: MetaVectorStoreDeps) {}

  async get(projectId: ProjectId): Promise<ProjectMetaVector | null> {
    const dims = META_VECTOR_EMBEDDER_DIMS;
    const zeroVector = Array.from({ length: dims }, () => 0);
    const results = await this.deps.vectorStore.search(
      META_VECTORS_COLLECTION,
      zeroVector,
      1,
      { where: { projectId } },
    );
    if (results.length === 0) return null;
    const r = results[0]!;
    const meta = r.metadata as Record<string, unknown>;
    const vector = meta.vector as number[] | undefined;
    if (!Array.isArray(vector)) return null;
    const parsed = ProjectMetaVectorSchema.safeParse({
      projectId: meta.projectId ?? r.id,
      vector,
      basedOn: meta.basedOn ?? [],
      evidenceRefs: meta.evidenceRefs ?? [],
      inputDigest: meta.inputDigest,
      refreshRecordId: meta.refreshRecordId,
      updatedAt: meta.updatedAt,
      createdAt: meta.createdAt,
    });
    if (!parsed.success) return null;
    return parsed.data;
  }

  async upsert(metaVector: ProjectMetaVector): Promise<void> {
    const parsed = ProjectMetaVectorSchema.parse(metaVector);
    await this.deps.vectorStore.upsert(
      META_VECTORS_COLLECTION,
      parsed.projectId,
      parsed.vector,
      {
        projectId: parsed.projectId,
        basedOn: parsed.basedOn,
        evidenceRefs: parsed.evidenceRefs,
        inputDigest: parsed.inputDigest,
        refreshRecordId: parsed.refreshRecordId,
        updatedAt: parsed.updatedAt,
        createdAt: parsed.createdAt,
        vector: parsed.vector,
      },
    );
  }

  async search(
    queryVector: number[],
    topK: number,
  ): Promise<MetaVectorSearchResult[]> {
    const raw = await this.deps.vectorStore.search(
      META_VECTORS_COLLECTION,
      queryVector,
      topK * 2,
    );
    const withRank: MetaVectorSearchResult[] = [];
    for (let i = 0; i < raw.length; i++) {
      const r = raw[i]!;
      const meta = r.metadata as Record<string, unknown>;
      const projectId = (meta.projectId ?? r.id) as ProjectId;
      withRank.push({
        projectId,
        similarity: r.score,
        rank: i + 1,
      });
    }
    const sorted = withRank.sort((a, b) => {
      if (b.similarity !== a.similarity) return b.similarity - a.similarity;
      return String(a.projectId).localeCompare(String(b.projectId));
    });
    return sorted.slice(0, topK).map((s, i) => ({
      ...s,
      rank: i + 1,
    }));
  }

  async delete(projectId: ProjectId): Promise<void> {
    await this.deps.vectorStore.delete(META_VECTORS_COLLECTION, projectId);
  }
}
