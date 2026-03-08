import { describe, expect, it } from 'vitest';
import {
  buildScoredCandidate,
  computeRetrievalScore,
} from '../scoring.js';

const NOW = '2026-03-07T00:00:00.000Z';
const YESTERDAY = '2026-03-06T00:00:00.000Z';
const LAST_WEEK = '2026-02-28T00:00:00.000Z';

interface BenchmarkCase {
  expectedTopId: string;
  candidates: Array<{
    id: string;
    similarity: number;
    type?: 'fact' | 'experience-record';
    confidence: number;
    updatedAt: string;
    sentiment?: 'positive' | 'strong-positive' | 'negative' | 'strong-negative';
  }>;
}

function makeEntry(input: {
  id: string;
  type: 'fact' | 'experience-record';
  confidence: number;
  updatedAt: string;
  sentiment?: 'positive' | 'strong-positive' | 'negative' | 'strong-negative';
}) {
  const base = {
    id: input.id as any,
    content: `entry ${input.id}`,
    type: input.type,
    scope: 'project' as const,
    confidence: input.confidence,
    sensitivity: [],
    retention: 'permanent' as const,
    provenance: { traceId: 'trace-1' as any, source: 'benchmark', timestamp: NOW },
    tags: [],
    createdAt: LAST_WEEK,
    updatedAt: input.updatedAt,
  };

  if (input.type === 'experience-record') {
    return {
      ...base,
      sentiment: input.sentiment ?? 'positive',
      context: 'ctx',
      action: 'act',
      outcome: 'out',
      reason: 'reason',
    };
  }

  return base;
}

const cases: BenchmarkCase[] = [
  {
    expectedTopId: 'neg-recent',
    candidates: [
      {
        id: 'generic-high-sim',
        similarity: 0.92,
        type: 'fact',
        confidence: 0.55,
        updatedAt: LAST_WEEK,
      },
      {
        id: 'neg-recent',
        similarity: 0.82,
        type: 'experience-record',
        confidence: 0.95,
        updatedAt: NOW,
        sentiment: 'strong-negative',
      },
    ],
  },
  {
    expectedTopId: 'pos-recent',
    candidates: [
      {
        id: 'neutral-old',
        similarity: 0.9,
        type: 'fact',
        confidence: 0.5,
        updatedAt: LAST_WEEK,
      },
      {
        id: 'pos-recent',
        similarity: 0.79,
        type: 'experience-record',
        confidence: 0.92,
        updatedAt: YESTERDAY,
        sentiment: 'strong-positive',
      },
    ],
  },
  {
    expectedTopId: 'steady-positive',
    candidates: [
      {
        id: 'barely-related',
        similarity: 0.88,
        type: 'fact',
        confidence: 0.4,
        updatedAt: LAST_WEEK,
      },
      {
        id: 'steady-positive',
        similarity: 0.8,
        type: 'experience-record',
        confidence: 0.9,
        updatedAt: NOW,
        sentiment: 'strong-positive',
      },
    ],
  },
];

function rankWeighted(testCase: BenchmarkCase): string[] {
  const updatedAts = testCase.candidates.map((candidate) => candidate.updatedAt);
  const minUpdatedAt = updatedAts.reduce((a, b) => (a < b ? a : b));
  const maxUpdatedAt = updatedAts.reduce((a, b) => (a > b ? a : b));

  return testCase.candidates
    .map((candidate) => {
      const entry = makeEntry({
        id: candidate.id,
        type: candidate.type ?? 'fact',
        confidence: candidate.confidence,
        updatedAt: candidate.updatedAt,
        sentiment: candidate.sentiment,
      });
      const scored = buildScoredCandidate(
        entry,
        candidate.similarity,
        minUpdatedAt,
        maxUpdatedAt,
      );
      return {
        id: candidate.id,
        score: computeRetrievalScore(scored),
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.id.localeCompare(b.id);
    })
    .map((candidate) => candidate.id);
}

function rankFlat(testCase: BenchmarkCase): string[] {
  return [...testCase.candidates]
    .sort((a, b) => {
      if (b.similarity !== a.similarity) {
        return b.similarity - a.similarity;
      }
      return a.id.localeCompare(b.id);
    })
    .map((candidate) => candidate.id);
}

describe('relevance benchmark', () => {
  it('outperforms a flat semantic baseline on deterministic fixtures', () => {
    const weightedHits = cases.filter(
      (testCase) => rankWeighted(testCase)[0] === testCase.expectedTopId,
    ).length;
    const flatHits = cases.filter(
      (testCase) => rankFlat(testCase)[0] === testCase.expectedTopId,
    ).length;

    expect(weightedHits).toBe(cases.length);
    expect(weightedHits).toBeGreaterThan(flatHits);
  });
});
