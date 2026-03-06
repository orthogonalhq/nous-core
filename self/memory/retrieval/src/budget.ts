/**
 * Token budget truncation for retrieval.
 *
 * Phase 4.2: Deterministic truncation with telemetry.
 */
import type { RetrievalResult, RetrievalBudgetTelemetry } from '@nous/shared';

/** Default tokens per character heuristic. ~4 chars per token for English. */
const DEFAULT_TOKENS_PER_CHAR = 1 / 4;

/**
 * Estimate token count for an entry. Uses content length * ratio.
 */
export function estimateTokens(
  content: string,
  tokensPerChar = DEFAULT_TOKENS_PER_CHAR,
): number {
  return Math.ceil(content.length * tokensPerChar);
}

/**
 * Truncate results by token budget. Deterministic: sort by score desc, tie-break by entry.id asc.
 * Returns truncated array and telemetry.
 */
export function truncateByTokenBudget(
  results: RetrievalResult[],
  tokenBudget: number,
  tokensPerChar = DEFAULT_TOKENS_PER_CHAR,
): { results: RetrievalResult[]; telemetry: RetrievalBudgetTelemetry } {
  if (tokenBudget <= 0) {
    return {
      results: [],
      telemetry: {
        consumedTokens: 0,
        candidateCount: results.length,
        truncatedCount: results.length,
      },
    };
  }

  const sorted = [...results].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(a.entry.id).localeCompare(String(b.entry.id));
  });

  let consumed = 0;
  const kept: RetrievalResult[] = [];
  for (const r of sorted) {
    const tokens = estimateTokens(r.entry.content, tokensPerChar);
    if (consumed + tokens > tokenBudget && kept.length > 0) break;
    kept.push(r);
    consumed += tokens;
  }

  return {
    results: kept,
    telemetry: {
      consumedTokens: consumed,
      candidateCount: results.length,
      truncatedCount: results.length - kept.length,
    },
  };
}
