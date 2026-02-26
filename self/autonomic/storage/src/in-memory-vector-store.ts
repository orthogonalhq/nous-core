/**
 * InMemoryVectorStore — IVectorStore implementation for tests and benchmarks.
 *
 * Phase 4.2: Stores vectors in memory, computes cosine similarity on search.
 * Used when LanceDB is not yet available.
 */
import type {
  IVectorStore,
  VectorSearchResult,
  VectorFilter,
} from '@nous/shared';

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  const sim = dot / denom;
  return Math.max(0, Math.min(1, (sim + 1) / 2));
}

interface StoredVector {
  vector: number[];
  metadata: Record<string, unknown>;
}

export class InMemoryVectorStore implements IVectorStore {
  private readonly collections = new Map<string, Map<string, StoredVector>>();

  private getCollection(collection: string): Map<string, StoredVector> {
    let coll = this.collections.get(collection);
    if (!coll) {
      coll = new Map();
      this.collections.set(collection, coll);
    }
    return coll;
  }

  async upsert(
    collection: string,
    id: string,
    vector: number[],
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const coll = this.getCollection(collection);
    coll.set(id, { vector, metadata });
  }

  async search(
    collection: string,
    query: number[],
    limit: number,
    filter?: VectorFilter,
  ): Promise<VectorSearchResult[]> {
    const coll = this.getCollection(collection);
    const candidates: { id: string; score: number; metadata: Record<string, unknown> }[] = [];

    for (const [id, stored] of coll) {
      if (filter?.where) {
        let match = true;
        for (const [k, v] of Object.entries(filter.where)) {
          if (stored.metadata[k] !== v) {
            match = false;
            break;
          }
        }
        if (!match) continue;
      }
      const score = cosineSimilarity(query, stored.vector);
      candidates.push({ id, score, metadata: stored.metadata });
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, limit).map((c) => ({
      id: c.id,
      score: c.score,
      metadata: c.metadata,
    }));
  }

  async delete(collection: string, id: string): Promise<boolean> {
    const coll = this.getCollection(collection);
    return coll.delete(id);
  }
}
