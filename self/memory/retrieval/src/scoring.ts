/**
 * Retrieval scoring for Nous-OSS.
 *
 * Phase 4.2: Deterministic sentiment-weighted scoring formula.
 */
import { getSentimentWeight } from '@nous/shared';
import type { MemoryEntry, RetrievalResult, RetrievalScoringWeights } from '@nous/shared';
import { DEFAULT_RETRIEVAL_WEIGHTS } from '@nous/shared';

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * Compute sentiment weight component for an entry. Non-experience-record entries use 0.
 */
function getSentimentComponent(entry: MemoryEntry): number {
  if (entry.type !== 'experience-record' || !entry.sentiment) return 0;
  return Math.abs(getSentimentWeight(entry.sentiment));
}

/**
 * Compute recency component [0,1]. Uses reference times from the candidate set.
 * Most recent = 1, oldest = 0 (linear interpolation).
 */
function getRecencyComponent(
  updatedAt: string,
  minUpdatedAt: string,
  maxUpdatedAt: string,
): number {
  if (minUpdatedAt === maxUpdatedAt) return 1;
  const range = new Date(maxUpdatedAt).getTime() - new Date(minUpdatedAt).getTime();
  const pos = new Date(updatedAt).getTime() - new Date(minUpdatedAt).getTime();
  return clamp01(pos / range);
}

export interface ScoredCandidate {
  entry: MemoryEntry;
  similarity: number;
  sentimentWeight: number;
  recency: number;
  confidence: number;
}

/**
 * Compute retrieval score from components. Deterministic.
 * Tie-break: entry.id lexicographic ascending (handled by caller when sorting).
 */
export function computeRetrievalScore(
  candidate: ScoredCandidate,
  weights: RetrievalScoringWeights = DEFAULT_RETRIEVAL_WEIGHTS,
): number {
  const sim = clamp01(candidate.similarity);
  const sent = clamp01(candidate.sentimentWeight);
  const rec = clamp01(candidate.recency);
  const conf = clamp01(candidate.confidence);
  return (
    weights.wSimilarity * sim +
    weights.wSentiment * sent +
    weights.wRecency * rec +
    weights.wConfidence * conf
  );
}

/**
 * Build ScoredCandidate from vector search result and LTM entry.
 * Computes recency relative to the provided min/max updatedAt range.
 */
export function buildScoredCandidate(
  entry: MemoryEntry,
  similarity: number,
  minUpdatedAt: string,
  maxUpdatedAt: string,
): ScoredCandidate {
  return {
    entry,
    similarity: clamp01(similarity),
    sentimentWeight: getSentimentComponent(entry),
    recency: getRecencyComponent(entry.updatedAt, minUpdatedAt, maxUpdatedAt),
    confidence: clamp01(entry.confidence),
  };
}

/**
 * Convert ScoredCandidate to RetrievalResult with combined score.
 */
export function toRetrievalResult(
  candidate: ScoredCandidate,
  score: number,
): RetrievalResult {
  return {
    entry: candidate.entry,
    score,
    components: {
      similarity: candidate.similarity,
      sentimentWeight: candidate.sentimentWeight,
      recency: candidate.recency,
      confidence: candidate.confidence,
    },
  };
}
