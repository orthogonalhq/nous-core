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
  RetrievalScoringWeights,
  MemoryEntry,
  MemoryEntryId,
  RetrievalBudgetTelemetry,
  RetrievalDecisionMetadata,
  MemoryQueryFilter,
} from '@nous/shared';
import {
  DEFAULT_RETRIEVAL_WEIGHTS,
  RETRIEVAL_TIE_BREAK_STRATEGY,
} from '@nous/shared';
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

function buildVectorFilter(
  query: RetrievalQuery,
): { where: Record<string, unknown> } | undefined {
  const where: Record<string, unknown> = {};
  const effectiveScope = query.filters?.scope ?? query.scope;
  if (effectiveScope) {
    where.scope = effectiveScope;
  }
  if (query.filters?.projectId) {
    where.projectId = query.filters.projectId;
  } else if (
    effectiveScope === 'project' &&
    query.projectId &&
    (!query.targetProjectIds || query.targetProjectIds.length === 0)
  ) {
    where.projectId = query.projectId;
  }
  if (query.filters?.type) {
    where.memoryType = query.filters.type;
  }
  return Object.keys(where).length > 0 ? { where } : undefined;
}

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
      buildVectorFilter(query),
    );

    if (vectorResults.length === 0) {
      return buildRetrievalResponse({
        results: [],
        budgetTelemetry: {
          consumedTokens: 0,
          candidateCount: 0,
          truncatedCount: 0,
        },
        decision: buildDecisionMetadata({
          vectorCandidateCount: 0,
          scoredCandidateCount: 0,
          returnedCount: 0,
          truncationReason: 'none',
          weights,
        }),
      });
    }

    const entries: MemoryEntry[] = [];
    for (const vr of vectorResults) {
      const entry = await this.deps.ltmStore.read(vr.id as MemoryEntryId);
      if (entry && matchesQueryFilter(entry, query.filters)) {
        entries.push(entry);
      }
    }

    if (entries.length === 0) {
      return buildRetrievalResponse({
        results: [],
        budgetTelemetry: {
          consumedTokens: 0,
          candidateCount: 0,
          truncatedCount: 0,
        },
        decision: buildDecisionMetadata({
          vectorCandidateCount: vectorResults.length,
          scoredCandidateCount: 0,
          returnedCount: 0,
          truncationReason: 'none',
          weights,
        }),
      });
    }

    const updatedAts = entries.map((e) => e.updatedAt);
    const minUpdatedAt = updatedAts.reduce((a, b) => (a < b ? a : b));
    const maxUpdatedAt = updatedAts.reduce((a, b) => (a > b ? a : b));

    const scored = entries.map((entry) => {
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

    const { results, telemetry, truncationReason } = truncateByTokenBudget(
      sorted,
      query.tokenBudget,
    );

    return buildRetrievalResponse({
      results,
      budgetTelemetry: telemetry,
      decision: buildDecisionMetadata({
        vectorCandidateCount: vectorResults.length,
        scoredCandidateCount: sorted.length,
        returnedCount: results.length,
        truncationReason,
        weights,
      }),
    });
  }
}

function buildRetrievalResponse(input: {
  results: RetrievalResponse['results'];
  budgetTelemetry: RetrievalBudgetTelemetry;
  decision: RetrievalDecisionMetadata;
}): RetrievalResponse {
  return {
    results: input.results,
    budgetTelemetry: input.budgetTelemetry,
    decision: input.decision,
  };
}

function buildDecisionMetadata(input: {
  vectorCandidateCount: number;
  scoredCandidateCount: number;
  returnedCount: number;
  truncationReason: RetrievalDecisionMetadata['truncationReason'];
  weights: RetrievalScoringWeights;
}): RetrievalDecisionMetadata {
  return {
    vectorCandidateCount: input.vectorCandidateCount,
    scoredCandidateCount: input.scoredCandidateCount,
    returnedCount: input.returnedCount,
    truncationReason: input.truncationReason,
    tieBreakStrategy: RETRIEVAL_TIE_BREAK_STRATEGY,
    scoringWeights: input.weights,
  };
}

function matchesQueryFilter(
  entry: MemoryEntry,
  filter: MemoryQueryFilter | undefined,
): boolean {
  if (!filter) {
    return (entry.lifecycleStatus ?? 'active') === 'active';
  }

  if (filter.type != null && entry.type !== filter.type) {
    return false;
  }
  if (filter.scope != null && entry.scope !== filter.scope) {
    return false;
  }
  if (filter.projectId != null && entry.projectId !== filter.projectId) {
    return false;
  }
  if (filter.tags != null && filter.tags.length > 0) {
    const tags = new Set(entry.tags);
    if (!filter.tags.every((tag) => tags.has(tag))) {
      return false;
    }
  }
  if (
    filter.placementState != null &&
    entry.placementState !== filter.placementState
  ) {
    return false;
  }
  if (filter.fromDate != null && entry.updatedAt < filter.fromDate) {
    return false;
  }
  if (filter.toDate != null && entry.updatedAt > filter.toDate) {
    return false;
  }

  const allowedStatuses = resolveAllowedLifecycleStatuses(filter);
  return allowedStatuses.has(entry.lifecycleStatus ?? 'active');
}

function resolveAllowedLifecycleStatuses(
  filter: MemoryQueryFilter,
): Set<MemoryEntry['lifecycleStatus']> {
  if (filter.lifecycleStatus != null) {
    return new Set([filter.lifecycleStatus]);
  }

  const statuses: MemoryEntry['lifecycleStatus'][] = ['active'];
  if (filter.includeSuperseded) {
    statuses.push('superseded');
  }
  if (filter.includeDeleted) {
    statuses.push('soft-deleted', 'hard-deleted');
  }

  return new Set(statuses);
}
