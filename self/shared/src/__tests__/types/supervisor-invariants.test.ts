/**
 * Supervisor invariant constant-table tests (WR-162 SP 1).
 *
 * Verifies SUPERVISOR_INVARIANT_CODES, SUPERVISOR_INVARIANT_SEVERITY_MAP,
 * and SUPERVISOR_CRITICAL_ACTION_CATEGORIES match the taxonomy / evidence
 * decision docs verbatim.
 */
import { describe, it, expect } from 'vitest';
import {
  SUPERVISOR_INVARIANT_CODES,
  SUPERVISOR_INVARIANT_SEVERITY_MAP,
  SUPERVISOR_CRITICAL_ACTION_CATEGORIES,
} from '../../types/supervisor-invariants.js';

describe('SUPERVISOR_INVARIANT_CODES', () => {
  it('contains exactly 12 codes SUP-001..SUP-012 in order', () => {
    expect(SUPERVISOR_INVARIANT_CODES).toHaveLength(12);
    expect([...SUPERVISOR_INVARIANT_CODES]).toEqual([
      'SUP-001',
      'SUP-002',
      'SUP-003',
      'SUP-004',
      'SUP-005',
      'SUP-006',
      'SUP-007',
      'SUP-008',
      'SUP-009',
      'SUP-010',
      'SUP-011',
      'SUP-012',
    ]);
  });
});

describe('SUPERVISOR_INVARIANT_SEVERITY_MAP', () => {
  // Taxonomy: S0 = SUP-001/002/007; S1 = SUP-003/004/005/006/008;
  // S3 = SUP-009/010/011/012. No S2 invariants in v1.
  const expectedSeverity: Record<string, 'S0' | 'S1' | 'S3'> = {
    'SUP-001': 'S0',
    'SUP-002': 'S0',
    'SUP-003': 'S1',
    'SUP-004': 'S1',
    'SUP-005': 'S1',
    'SUP-006': 'S1',
    'SUP-007': 'S0',
    'SUP-008': 'S1',
    'SUP-009': 'S3',
    'SUP-010': 'S3',
    'SUP-011': 'S3',
    'SUP-012': 'S3',
  };

  // S0 → hard_stop, S1 → auto_pause, S3 → warn per
  // supervisor-evidence-contract-v1.md § Invariant-to-Severity Mappings.
  const expectedEnforcement: Record<'S0' | 'S1' | 'S3', string> = {
    S0: 'hard_stop',
    S1: 'auto_pause',
    S3: 'warn',
  };

  it('has exactly 12 entries', () => {
    expect(Object.keys(SUPERVISOR_INVARIANT_SEVERITY_MAP)).toHaveLength(12);
  });

  it('maps every SUP code to the expected severity and enforcement', () => {
    for (const code of SUPERVISOR_INVARIANT_CODES) {
      const entry = SUPERVISOR_INVARIANT_SEVERITY_MAP[code];
      expect(entry, `missing entry for ${code}`).toBeDefined();
      const sev = expectedSeverity[code]!;
      expect(entry.severity).toBe(sev);
      expect(entry.enforcement).toBe(expectedEnforcement[sev]);
    }
  });
});

describe('SUPERVISOR_CRITICAL_ACTION_CATEGORIES', () => {
  it('equals ["supervisor-detection", "supervisor-enforcement"] exactly', () => {
    expect([...SUPERVISOR_CRITICAL_ACTION_CATEGORIES]).toEqual([
      'supervisor-detection',
      'supervisor-enforcement',
    ]);
    expect(SUPERVISOR_CRITICAL_ACTION_CATEGORIES).toHaveLength(2);
  });
});
