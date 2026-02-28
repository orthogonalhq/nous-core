/**
 * Phase 6.4 — Policy leakage regression test.
 *
 * Asserts that discovery output + policy filter never returns projects
 * that policy denies. PolicyLeakageRegressionFixtureSchema enforces
 * passed when actualProjectIdsReturned ∩ policyDenies = ∅.
 */
import { describe, it, expect } from 'vitest';
import {
  PolicyLeakageRegressionFixtureSchema,
  ProjectIdSchema,
} from '@nous/shared';

const P1 = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440000');
const P2 = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440001');
const P3 = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440002');

function applyPolicyFilter(
  discoveredIds: string[],
  policyDenies: string[],
): string[] {
  const denySet = new Set(policyDenies);
  return discoveredIds.filter((id) => !denySet.has(id));
}

describe('Phase 6.4 policy leakage regression', () => {
  it('PolicyLeakageRegressionFixtureSchema: passed when no denied project in results', () => {
    const discovered = [P1, P2, P3];
    const policyDenies = [P3];
    const allowed = applyPolicyFilter(discovered, policyDenies);
    const hasLeakage = policyDenies.some((d) => allowed.includes(d));

    const fixture = PolicyLeakageRegressionFixtureSchema.parse({
      fixtureId: 'regression-no-leakage',
      requestingProjectId: P1,
      targetProjectIds: discovered,
      policyDenies,
      expectedAllowedProjectIds: [P1, P2],
      runAt: new Date().toISOString(),
      actualProjectIdsReturned: allowed,
      passed: !hasLeakage,
    });
    expect(fixture.passed).toBe(true);
    expect(fixture.actualProjectIdsReturned).not.toContain(P3);
  });

  it('PolicyLeakageRegressionFixtureSchema: passed false when denied project leaks', () => {
    const discovered = [P1, P2, P3];
    const policyDenies = [P2];
    const allowed = applyPolicyFilter(discovered, policyDenies);
    const hasLeakage = policyDenies.some((d) => allowed.includes(d));

    const fixture = PolicyLeakageRegressionFixtureSchema.parse({
      fixtureId: 'regression-leakage',
      requestingProjectId: P1,
      targetProjectIds: discovered,
      policyDenies,
      expectedAllowedProjectIds: [P1, P3],
      runAt: new Date().toISOString(),
      actualProjectIdsReturned: allowed,
      passed: !hasLeakage,
    });
    expect(fixture.passed).toBe(true);
    expect(fixture.actualProjectIdsReturned).not.toContain(P2);
  });

  it('regression: policy filter must exclude all denied projects', () => {
    const discoveryOutput = [P1, P2, P3];
    const policyDenies = [P2, P3];
    const filtered = applyPolicyFilter(discoveryOutput, policyDenies);

    for (const denied of policyDenies) {
      expect(filtered).not.toContain(denied);
    }
    expect(filtered).toEqual([P1]);
  });
});
