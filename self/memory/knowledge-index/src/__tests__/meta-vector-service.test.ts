/**
 * Phase 6.2 — MetaVectorService behavior tests.
 */
import { describe, it, expect } from 'vitest';
import { MetaVectorStore } from '../meta-vectors/meta-vector-store.js';
import { MetaVectorService } from '../meta-vectors/meta-vector-service.js';
import { InMemoryVectorStore } from '@nous/autonomic-storage';
import { InMemoryEmbedder } from '@nous/autonomic-embeddings';
import type { ProjectId, ProjectMetaVector } from '@nous/shared';
import { ProjectIdSchema } from '@nous/shared';

const P1 = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440000');
const P2 = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440001');
const P3 = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440002');

function makeMetaVector(
  projectId: ProjectId,
  vector: number[],
): ProjectMetaVector {
  const now = new Date().toISOString();
  return {
    projectId,
    vector,
    basedOn: [],
    updatedAt: now,
    createdAt: now,
  };
}

describe('MetaVectorService', () => {
  it('searchSimilarProjects returns empty when store is empty', async () => {
    const store = new MetaVectorStore({
      vectorStore: new InMemoryVectorStore(),
    });
    const embedder = new InMemoryEmbedder(128);
    const service = new MetaVectorService({ store, embedder });
    const queryVec = await embedder.embed('test query');
    const result = await service.searchSimilarProjects(queryVec, 5);
    expect(result).toEqual([]);
  });

  it('searchSimilarProjects returns ranked ProjectIds by similarity', async () => {
    const vectorStore = new InMemoryVectorStore();
    const store = new MetaVectorStore({ vectorStore });
    const embedder = new InMemoryEmbedder(128);
    await store.upsert(
      makeMetaVector(P1, await embedder.embed('real estate deals')),
    );
    await store.upsert(
      makeMetaVector(P2, await embedder.embed('budget planning')),
    );
    await store.upsert(
      makeMetaVector(P3, await embedder.embed('real estate investment')),
    );
    const service = new MetaVectorService({ store, embedder });
    const queryVec = await embedder.embed('real estate');
    const result = await service.searchSimilarProjects(queryVec, 3);
    expect(result).toHaveLength(3);
    expect(result).toContain(P1);
    expect(result).toContain(P2);
    expect(result).toContain(P3);
  });

  it('upsert replaces existing meta-vector for same project', async () => {
    const store = new MetaVectorStore({
      vectorStore: new InMemoryVectorStore(),
    });
    const embedder = new InMemoryEmbedder(128);
    await store.upsert(
      makeMetaVector(P1, await embedder.embed('old content')),
    );
    await store.upsert(
      makeMetaVector(P1, await embedder.embed('new content')),
    );
    const got = await store.get(P1);
    expect(got).not.toBeNull();
    expect(got!.vector).toEqual(await embedder.embed('new content'));
  });

  it('get returns null when no meta-vector exists', async () => {
    const store = new MetaVectorStore({
      vectorStore: new InMemoryVectorStore(),
    });
    const got = await store.get(P1);
    expect(got).toBeNull();
  });
});
