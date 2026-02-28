/**
 * Phase 6.2 — Cross-project relevance benchmark schema contract tests.
 */
import { describe, it, expect } from 'vitest';
import { CrossProjectRelevanceBenchmarkSchema } from '../../types/cross-project-benchmark.js';
import { ProjectIdSchema } from '../../types/ids.js';

const P1 = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440000');
const P2 = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440001');

describe('CrossProjectRelevanceBenchmarkSchema', () => {
  it('accepts valid benchmark with benchmarkId, expected, actual, passed', () => {
    const valid = {
      benchmarkId: 'bench-001',
      queryEmbeddingRef: 'ref-embed-1',
      expectedProjectRanking: [P1, P2],
      runAt: '2026-02-28T00:00:00.000Z',
      actualRanking: [P1, P2],
      passed: true,
    };
    const parsed = CrossProjectRelevanceBenchmarkSchema.parse(valid);
    expect(parsed.benchmarkId).toBe('bench-001');
    expect(parsed.expectedProjectRanking).toEqual([P1, P2]);
    expect(parsed.actualRanking).toEqual([P1, P2]);
    expect(parsed.passed).toBe(true);
  });

  it('accepts optional tolerance', () => {
    const valid = {
      benchmarkId: 'bench-002',
      queryEmbeddingRef: 'ref-embed-2',
      expectedProjectRanking: [P1, P2],
      tolerance: 0.1,
      runAt: '2026-02-28T00:00:00.000Z',
      actualRanking: [P2, P1],
      passed: false,
    };
    const parsed = CrossProjectRelevanceBenchmarkSchema.parse(valid);
    expect(parsed.tolerance).toBe(0.1);
  });
});
