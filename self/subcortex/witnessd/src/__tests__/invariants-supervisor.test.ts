/**
 * WR-162 SP 4 — witnessd SUP-prefix invariant registration (UT-WD1..UT-WD3).
 *
 * Canonical sources:
 * - SDS § Boundaries § Interfaces item 5 revised cycle 2 (SUPV-SP4-006).
 * - SDS § Invariants SUPV-SP4-006-b (BASE_POLICY['SUP'] fallback).
 * - supervisor-violation-taxonomy-v1.md § Invariant Code Catalog.
 * - supervisor-evidence-contract-v1.md § Invariant-to-Severity Mappings.
 *
 * Locks:
 * - UT-WD1: SUP-001..SUP-008 resolve to kebab-case taxonomy rows.
 * - UT-WD2: pre-existing prefixes (AUTH, CHAIN, ISO, ...) unchanged (regression).
 * - UT-WD3: SUP-009..SUP-012 fall through to BASE_POLICY['SUP'] safe
 *   fallback `{ S2, review }` per SUPV-SP4-006-b. SP 6 adds explicit rows
 *   and removes this fallback.
 */
import { describe, expect, it } from 'vitest';
import { mapInvariantToEnforcement } from '../invariants.js';

describe('mapInvariantToEnforcement — SUP-001..SUP-008 (UT-WD1)', () => {
  it('SUP-001 maps to { S0, hard-stop }', () => {
    expect(mapInvariantToEnforcement('SUP-001')).toEqual({
      code: 'SUP-001',
      severity: 'S0',
      enforcement: 'hard-stop',
    });
  });

  it('SUP-002 maps to { S0, hard-stop }', () => {
    expect(mapInvariantToEnforcement('SUP-002')).toEqual({
      code: 'SUP-002',
      severity: 'S0',
      enforcement: 'hard-stop',
    });
  });

  it('SUP-003 maps to { S1, auto-pause }', () => {
    expect(mapInvariantToEnforcement('SUP-003')).toEqual({
      code: 'SUP-003',
      severity: 'S1',
      enforcement: 'auto-pause',
    });
  });

  it('SUP-004 maps to { S1, auto-pause }', () => {
    expect(mapInvariantToEnforcement('SUP-004')).toEqual({
      code: 'SUP-004',
      severity: 'S1',
      enforcement: 'auto-pause',
    });
  });

  it('SUP-005 maps to { S1, auto-pause }', () => {
    expect(mapInvariantToEnforcement('SUP-005')).toEqual({
      code: 'SUP-005',
      severity: 'S1',
      enforcement: 'auto-pause',
    });
  });

  it('SUP-006 maps to { S1, auto-pause }', () => {
    expect(mapInvariantToEnforcement('SUP-006')).toEqual({
      code: 'SUP-006',
      severity: 'S1',
      enforcement: 'auto-pause',
    });
  });

  it('SUP-007 maps to { S0, hard-stop }', () => {
    expect(mapInvariantToEnforcement('SUP-007')).toEqual({
      code: 'SUP-007',
      severity: 'S0',
      enforcement: 'hard-stop',
    });
  });

  it('SUP-008 maps to { S1, auto-pause }', () => {
    expect(mapInvariantToEnforcement('SUP-008')).toEqual({
      code: 'SUP-008',
      severity: 'S1',
      enforcement: 'auto-pause',
    });
  });
});

describe('mapInvariantToEnforcement — pre-existing prefix regression (UT-WD2)', () => {
  it('AUTH-001 continues to map to { S0, hard-stop }', () => {
    expect(mapInvariantToEnforcement('AUTH-001')).toEqual({
      code: 'AUTH-001',
      severity: 'S0',
      enforcement: 'hard-stop',
    });
  });

  it('CHAIN-001 continues to map to { S0, hard-stop }', () => {
    expect(mapInvariantToEnforcement('CHAIN-001')).toEqual({
      code: 'CHAIN-001',
      severity: 'S0',
      enforcement: 'hard-stop',
    });
  });

  it('ISO-001 continues to map to { S0, hard-stop }', () => {
    expect(mapInvariantToEnforcement('ISO-001')).toEqual({
      code: 'ISO-001',
      severity: 'S0',
      enforcement: 'hard-stop',
    });
  });

  it('POL-001 continues to map to { S2, review }', () => {
    expect(mapInvariantToEnforcement('POL-001')).toEqual({
      code: 'POL-001',
      severity: 'S2',
      enforcement: 'review',
    });
  });

  it('EVID-001 continues to map to { S1, auto-pause }', () => {
    expect(mapInvariantToEnforcement('EVID-001')).toEqual({
      code: 'EVID-001',
      severity: 'S1',
      enforcement: 'auto-pause',
    });
  });

  it('EVID-INTEGRITY promotion to { S0, hard-stop } preserved', () => {
    expect(mapInvariantToEnforcement('EVID-INTEGRITY-001')).toEqual({
      code: 'EVID-INTEGRITY-001',
      severity: 'S0',
      enforcement: 'hard-stop',
    });
  });

  it('MEM-AUTHORITY promotion to { S1, auto-pause } preserved', () => {
    expect(mapInvariantToEnforcement('MEM-AUTHORITY-001')).toEqual({
      code: 'MEM-AUTHORITY-001',
      severity: 'S1',
      enforcement: 'auto-pause',
    });
  });
});

describe('mapInvariantToEnforcement — SUP-009..SUP-012 landed (UT-WD3 / SUPV-SP6-009)', () => {
  // WR-162 SP 6 (SUPV-SP6-009 Option A) — SUP-009..SUP-012 registered
  // explicitly at `{ S3, warn }`; `BASE_POLICY['SUP']` wildcard removed.
  // Pre-SP-6 these codes fell through to the safe `{ S2, review }` fallback.
  for (const code of ['SUP-009', 'SUP-010', 'SUP-011', 'SUP-012'] as const) {
    it(`${code} now maps to { S3, warn }`, () => {
      expect(mapInvariantToEnforcement(code)).toEqual({
        code,
        severity: 'S3',
        enforcement: 'warn',
      });
    });
  }

  it('unknown SUP code (SUP-099) is now rejected at invariant lookup', () => {
    // Post-wildcard-removal: unknown SUP codes throw at `.parse(...)`. This
    // is the intended contract tightening (Goals SC 7 row 5).
    expect(() => mapInvariantToEnforcement('SUP-099')).toThrow();
  });
});
