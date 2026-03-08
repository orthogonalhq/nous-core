/**
 * Token budget truncation tests.
 */
import { describe, it, expect } from 'vitest';
import { truncateByTokenBudget, estimateTokens } from '../budget.js';

const NOW = new Date().toISOString();

function makeResult(content: string, score: number, id: string) {
  return {
    entry: {
      id: id as any,
      content,
      type: 'fact' as const,
      scope: 'project' as const,
      confidence: 0.9,
      sensitivity: [],
      retention: 'permanent' as const,
      provenance: { traceId: 't' as any, source: 'test', timestamp: NOW },
      tags: [],
      createdAt: NOW,
      updatedAt: NOW,
    },
    score,
    components: {
      similarity: 0.9,
      sentimentWeight: 0.5,
      recency: 0.8,
      confidence: 0.9,
    },
  };
}

describe('estimateTokens', () => {
  it('estimates ~1 token per 4 chars by default', () => {
    expect(estimateTokens('hello')).toBe(2);
    expect(estimateTokens('')).toBe(0);
  });
});

describe('truncateByTokenBudget', () => {
  it('respects tokenBudget', () => {
    const results = [
      makeResult('short', 0.9, 'a'),
      makeResult('longer content here', 0.8, 'b'),
      makeResult('x', 0.7, 'c'),
    ];
    const { telemetry, truncationReason } = truncateByTokenBudget(results, 5);
    expect(telemetry.consumedTokens).toBeLessThanOrEqual(5);
    expect(telemetry.candidateCount).toBe(3);
    expect(telemetry.truncatedCount).toBeGreaterThanOrEqual(0);
    expect(truncationReason).toBe('token_budget');
  });

  it('returns deterministic ordering: score desc, then id asc', () => {
    const results = [
      makeResult('a', 0.8, 'z'),
      makeResult('b', 0.9, 'a'),
      makeResult('c', 0.8, 'm'),
    ];
    const { results: kept } = truncateByTokenBudget(results, 100);
    expect(kept[0].score).toBe(0.9);
    expect(kept[1].score).toBe(0.8);
    expect(kept[1].entry.id).toBe('m');
    expect(kept[2].entry.id).toBe('z');
  });

  it('telemetry fields are correct', () => {
    const results = [
      makeResult('x', 0.9, 'a'),
      makeResult('y', 0.8, 'b'),
    ];
    const { telemetry, truncationReason } = truncateByTokenBudget(results, 100);
    expect(telemetry.consumedTokens).toBeGreaterThanOrEqual(0);
    expect(telemetry.candidateCount).toBe(2);
    expect(telemetry.truncatedCount).toBe(0);
    expect(truncationReason).toBe('none');
  });

  it('returns empty results when tokenBudget is zero', () => {
    const results = [
      makeResult('x', 0.9, 'a'),
      makeResult('y', 0.8, 'b'),
    ];
    const { results: kept, telemetry, truncationReason } = truncateByTokenBudget(results, 0);
    expect(kept).toEqual([]);
    expect(telemetry.consumedTokens).toBe(0);
    expect(telemetry.candidateCount).toBe(2);
    expect(telemetry.truncatedCount).toBe(2);
    expect(truncationReason).toBe('token_budget');
  });

  it('does not return an entry that exceeds the available budget by itself', () => {
    const results = [makeResult('x'.repeat(40), 0.9, 'a')];
    const { results: kept, telemetry, truncationReason } = truncateByTokenBudget(
      results,
      5,
    );

    expect(kept).toEqual([]);
    expect(telemetry.consumedTokens).toBe(0);
    expect(telemetry.truncatedCount).toBe(1);
    expect(truncationReason).toBe('token_budget');
  });
});
