/**
 * SentimentWeightedRetrievalEngine — IRetrievalEngine implementation.
 *
 * Phase 4.2: Combines semantic similarity, sentiment, recency, confidence.
 * Delegates to ILtmStore, IVectorStore, IEmbedder.
 */
import type {
  IRetrievalEngine,
  ILtmStore,
  IVectorStore,
  IEmbedder,
  RetrievalQuery,
  RetrievalResponse,
  RetrievalResult,
  RetrievalScoringWeights,
  MemoryEntry,
  MemoryEntryId,
} from '@nous/shared';
import { DEFAULT_RETRIEVAL_WEIGHTS } from '@nous/shared';
import {
  buildScoredCandidate,
  computeRetrievalScore,
  toRetrievalResult,
} from './scoring.js';
import { truncateByTokenBudget } from './budget.js';

export interface SentimentWeightedRetrievalEngineDeps {
  ltmStore: ILtmStore;
  vectorStore: IVectorStore;
  embedder: IEmbedder;
  collection?: string;
  weights?: RetrievalScoringWeights;
}

const DEFAULT_COLLECTION = 'memory';
const VECTOR_SEARCH_LIMIT = 100;

export class SentimentWeightedRetrievalEngine implements IRetrievalEngine {
  constructor(private readonly deps: SentimentWeightedRetrievalEngineDeps) {}

  async retrieve(query: RetrievalQuery): Promise<RetrievalResponse> {
    const collection = this.deps.collection ?? DEFAULT_COLLECTION;
    const weights = this.deps.weights ?? DEFAULT_RETRIEVAL_WEIGHTS;

    const queryVector = await this.deps.embedder.embed(query.situation);
    const vectorResults = await this.deps.vectorStore.search(
      collection,
      queryVector,
      VECTOR_SEARCH_LIMIT,
      query.filters?.projectId
        ? { where: { projectId: query.filters.projectId } }
        : undefined,
    );

    if (vectorResults.length === 0) {
      const { results, telemetry } = truncateByTokenBudget([], query.tokenBudget);
      return { results };
    }

    const entries: MemoryEntry[] = [];
    for (const vr of vectorResults) {
      const entry = await this.deps.ltmStore.read(vr.id as MemoryEntryId);
      if (entry) entries.push(entry);
    }

    if (entries.length === 0) {
      return { results: [] };
    }

    const updatedAts = entries.map((e) => e.updatedAt);
    const minUpdatedAt = updatedAts.reduce((a, b) => (a < b ? a : b));
    const maxUpdatedAt = updatedAts.reduce((a, b) => (a > b ? a : b));

    const scored = entries.map((entry, i) => {
      const vr = vectorResults.find((r) => r.id === entry.id);
      const similarity = vr?.score ?? 0;
      const candidate = buildScoredCandidate(
        entry,
        similarity,
        minUpdatedAt,
        maxUpdatedAt,
      );
      const score = computeRetrievalScore(candidate, weights);
      return toRetrievalResult(candidate, score);
    });

    const sorted = scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.entry.id).localeCompare(String(b.entry.id));
    });

    const { results, telemetry } = truncateByTokenBudget(
      sorted,
      query.tokenBudget,
    );

    return { results };
  }
}
