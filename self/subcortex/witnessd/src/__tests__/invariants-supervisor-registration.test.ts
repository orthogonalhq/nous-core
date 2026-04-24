/**
 * WR-162 SP 6 — SUPV-SP6-009 invariant-registration tests (UT-WT1..UT-WT5).
 *
 * Asserts:
 * - SUP-009..SUP-012 each resolve to `{ severity: 'S3', enforcement: 'warn' }`
 *   (matches SP 1 authoritative `SUPERVISOR_INVARIANT_SEVERITY_MAP` verbatim).
 * - Unknown SUP code (e.g., `'SUP-999'`) is rejected at the invariant lookup
 *   now that the SP 4 `BASE_POLICY['SUP']` wildcard is removed.
 */
import { describe, expect, it } from 'vitest';
import type { InvariantCode } from '@nous/shared';
import { mapInvariantToEnforcement } from '../invariants.js';

describe('witnessd invariant registry — SUP-009..SUP-012 (SP 6 SUPV-SP6-009)', () => {
  it('maps SUP-009 to { severity: S3, enforcement: warn }', () => {
    const decision = mapInvariantToEnforcement('SUP-009' as InvariantCode);
    expect(decision.severity).toBe('S3');
    expect(decision.enforcement).toBe('warn');
  });

  it('maps SUP-010 to { severity: S3, enforcement: warn }', () => {
    const decision = mapInvariantToEnforcement('SUP-010' as InvariantCode);
    expect(decision.severity).toBe('S3');
    expect(decision.enforcement).toBe('warn');
  });

  it('maps SUP-011 to { severity: S3, enforcement: warn }', () => {
    const decision = mapInvariantToEnforcement('SUP-011' as InvariantCode);
    expect(decision.severity).toBe('S3');
    expect(decision.enforcement).toBe('warn');
  });

  it('maps SUP-012 to { severity: S3, enforcement: warn }', () => {
    const decision = mapInvariantToEnforcement('SUP-012' as InvariantCode);
    expect(decision.severity).toBe('S3');
    expect(decision.enforcement).toBe('warn');
  });

  it('rejects unknown SUP code (SUP-999) — wildcard removed', () => {
    // Pre-SP-6 the BASE_POLICY['SUP'] wildcard silently admitted any SUP
    // code; SP 6 removes the wildcard so unknown codes now throw at parse.
    expect(() =>
      mapInvariantToEnforcement('SUP-999' as InvariantCode),
    ).toThrow();
  });
});
