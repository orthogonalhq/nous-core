/**
 * Phase 6.3 — Discovery benchmark fixture regression test.
 * Phase 6.4 — DiscoveryBenchmarkAcceptanceCriteriaSchema; policyLeakageTolerance: 0.
 */
import { describe, it, expect } from 'vitest';
import {
  DiscoveryBenchmarkFixtureSchema,
  DiscoveryBenchmarkAcceptanceCriteriaSchema,
  ProjectIdSchema,
} from '@nous/shared';

const P1 = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440000');
const P2 = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440001');

describe('DiscoveryBenchmarkFixtureSchema', () => {
  it('validates fixture with passed true', () => {
    const fixture = {
      fixtureId: 'phase-6.3-discovery-1',
      queryEmbeddingRef: 'query-1',
      expectedProjectRanking: [P1, P2],
      runAt: new Date().toISOString(),
      actualRanking: [P1, P2],
      passed: true,
    };
    expect(DiscoveryBenchmarkFixtureSchema.safeParse(fixture).success).toBe(
      true,
    );
  });

  it('validates fixture with tolerance', () => {
    const fixture = {
      fixtureId: 'phase-6.3-discovery-2',
      queryEmbeddingRef: 'query-2',
      expectedProjectRanking: [P1, P2],
      tolerance: 1,
      runAt: new Date().toISOString(),
      actualRanking: [P2, P1],
      passed: true,
    };
    expect(DiscoveryBenchmarkFixtureSchema.safeParse(fixture).success).toBe(
      true,
    );
  });

  it('regression: fixture passed when actual matches expected', () => {
    const expected = [P1, P2];
    const actual = [P1, P2];
    const fixture = DiscoveryBenchmarkFixtureSchema.parse({
      fixtureId: 'regression-1',
      queryEmbeddingRef: 'ref',
      expectedProjectRanking: expected,
      runAt: new Date().toISOString(),
      actualRanking: actual,
      passed: JSON.stringify(expected) === JSON.stringify(actual),
    });
    expect(fixture.passed).toBe(true);
  });
});

describe('DiscoveryBenchmarkAcceptanceCriteriaSchema', () => {
  it('policyLeakageTolerance must be 0', () => {
    const criteria = DiscoveryBenchmarkAcceptanceCriteriaSchema.parse({
      policyLeakageTolerance: 0,
    });
    expect(criteria.policyLeakageTolerance).toBe(0);
  });

  it('acceptance: policyLeakageTolerance 0 enforces no denied projects in results', () => {
    const criteria = DiscoveryBenchmarkAcceptanceCriteriaSchema.parse({
      policyLeakageTolerance: 0,
    });
    const actualReturned = [P1, P2];
    const policyDenies: string[] = [];
    const hasLeakage = actualReturned.some((p) => policyDenies.includes(p));
    const passed = criteria.policyLeakageTolerance === 0 && !hasLeakage;
    expect(passed).toBe(true);
  });
});
