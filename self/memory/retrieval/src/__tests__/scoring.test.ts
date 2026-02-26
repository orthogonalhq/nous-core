/**
 * Scoring formula and tie-break tests.
 */
import { describe, it, expect } from 'vitest';
import {
  computeRetrievalScore,
  buildScoredCandidate,
  toRetrievalResult,
  type ScoredCandidate,
} from '../scoring.js';
import { DEFAULT_RETRIEVAL_WEIGHTS } from '@nous/shared';

const NOW = new Date().toISOString();
const PAST = new Date(Date.now() - 86400000).toISOString();

function makeEntry(id: string, confidence: number, updatedAt: string) {
  return {
    id: id as any,
    content: 'test',
    type: 'fact' as const,
    scope: 'project' as const,
    confidence,
    sensitivity: [],
    retention: 'permanent' as const,
    provenance: { traceId: 't' as any, source: 'test', timestamp: NOW },
    tags: [],
    createdAt: NOW,
    updatedAt,
  };
}

describe('computeRetrievalScore', () => {
  it('produces deterministic output for same inputs', () => {
    const c: ScoredCandidate = {
      entry: makeEntry('a', 0.9, NOW),
      similarity: 0.8,
      sentimentWeight: 0.5,
      recency: 1,
      confidence: 0.9,
    };
    const s1 = computeRetrievalScore(c);
    const s2 = computeRetrievalScore(c);
    expect(s1).toBe(s2);
  });

  it('uses DEFAULT_RETRIEVAL_WEIGHTS when not specified', () => {
    const c: ScoredCandidate = {
      entry: makeEntry('a', 0.9, NOW),
      similarity: 1,
      sentimentWeight: 0,
      recency: 1,
      confidence: 1,
    };
    const score = computeRetrievalScore(c);
    expect(score).toBeCloseTo(
      DEFAULT_RETRIEVAL_WEIGHTS.wSimilarity * 1 +
        DEFAULT_RETRIEVAL_WEIGHTS.wRecency * 1 +
        DEFAULT_RETRIEVAL_WEIGHTS.wConfidence * 1,
    );
  });

  it('clamps components to [0,1]', () => {
    const c: ScoredCandidate = {
      entry: makeEntry('a', 1.5, NOW),
      similarity: 1.2,
      sentimentWeight: -0.1,
      recency: 1,
      confidence: 0.9,
    };
    const score = computeRetrievalScore(c);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe('buildScoredCandidate', () => {
  it('computes recency: most recent = 1, oldest = 0', () => {
    const entry = makeEntry('a', 0.9, NOW);
    const candidate = buildScoredCandidate(entry, 0.8, PAST, NOW);
    expect(candidate.recency).toBe(1);
  });

  it('computes recency for older entry', () => {
    const entry = makeEntry('a', 0.9, PAST);
    const candidate = buildScoredCandidate(entry, 0.8, PAST, NOW);
    expect(candidate.recency).toBe(0);
  });
});

describe('toRetrievalResult', () => {
  it('produces valid RetrievalResult with components', () => {
    const c: ScoredCandidate = {
      entry: makeEntry('a', 0.9, NOW),
      similarity: 0.8,
      sentimentWeight: 0.5,
      recency: 1,
      confidence: 0.9,
    };
    const result = toRetrievalResult(c, 0.85);
    expect(result.entry.id).toBe('a');
    expect(result.score).toBe(0.85);
    expect(result.components.similarity).toBe(0.8);
    expect(result.components.sentimentWeight).toBe(0.5);
  });
});

describe('determinism regression', () => {
  it('identical inputs produce identical scores and ordering', () => {
    const entries = [
      makeEntry('id-1', 0.9, NOW),
      makeEntry('id-2', 0.8, PAST),
    ];
    const candidates = entries.map((e, i) =>
      buildScoredCandidate(e, 0.7 + i * 0.1, PAST, NOW),
    );
    const scores = candidates.map((c) => computeRetrievalScore(c));
    const scores2 = candidates.map((c) => computeRetrievalScore(c));
    expect(scores).toEqual(scores2);
  });
});
