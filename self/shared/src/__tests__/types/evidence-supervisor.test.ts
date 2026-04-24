/**
 * WR-162 SP 4 — @nous/shared evidence schema extensions (UT-SH1, UT-SH2).
 *
 * Canonical sources:
 * - SDS § Data Model § `@nous/shared` schema extensions.
 * - supervisor-evidence-contract-v1.md § New CriticalActionCategory Values.
 * - supervisor-violation-taxonomy-v1.md § Invariant Code Catalog.
 *
 * Locks:
 * - `CriticalActionCategorySchema` accepts `'supervisor-detection'` and
 *   `'supervisor-enforcement'` (both SP 4 additions) alongside every
 *   pre-existing value.
 * - `InvariantCodeSchema` accepts SUP-001..SUP-012 and forward-compat
 *   `SUP-013`+; rejects malformed lowercase / underscore / bare-prefix
 *   variants.
 * - `InvariantPrefixSchema` includes `'SUP'`.
 */
import { describe, expect, it } from 'vitest';
import {
  CriticalActionCategorySchema,
  InvariantCodeSchema,
  InvariantPrefixSchema,
} from '../../types/evidence.js';

describe('CriticalActionCategorySchema — SP 4 supervisor extensions (UT-SH1)', () => {
  it('accepts supervisor-detection', () => {
    const parsed = CriticalActionCategorySchema.safeParse('supervisor-detection');
    expect(parsed.success).toBe(true);
  });

  it('accepts supervisor-enforcement', () => {
    const parsed = CriticalActionCategorySchema.safeParse('supervisor-enforcement');
    expect(parsed.success).toBe(true);
  });

  it('continues to accept pre-existing values', () => {
    for (const value of [
      'model-invoke',
      'tool-execute',
      'memory-write',
      'trace-persist',
      'opctl-command',
      'mao-projection',
    ] as const) {
      expect(CriticalActionCategorySchema.safeParse(value).success).toBe(true);
    }
  });

  it('rejects unknown values', () => {
    expect(CriticalActionCategorySchema.safeParse('supervisor').success).toBe(false);
    expect(
      CriticalActionCategorySchema.safeParse('supervisor_detection').success,
    ).toBe(false);
  });
});

describe('InvariantPrefixSchema — SP 4 supervisor prefix', () => {
  it('accepts SUP', () => {
    expect(InvariantPrefixSchema.safeParse('SUP').success).toBe(true);
  });

  it('continues to accept pre-existing prefixes', () => {
    for (const prefix of [
      'AUTH',
      'EVID',
      'MEM',
      'CHAIN',
      'ISO',
      'PRV',
      'OPCTL',
      'START',
      'ESC',
      'MAO',
      'GTM',
      'POL',
      'WMODE',
      'PCP',
      'ING',
      'FR',
    ] as const) {
      expect(InvariantPrefixSchema.safeParse(prefix).success).toBe(true);
    }
  });
});

describe('InvariantCodeSchema — SP 4 SUP-code acceptance matrix (UT-SH2)', () => {
  it('accepts SUP-001..SUP-012', () => {
    for (let i = 1; i <= 12; i += 1) {
      const code = `SUP-${String(i).padStart(3, '0')}`;
      expect(InvariantCodeSchema.safeParse(code).success).toBe(true);
    }
  });

  it('accepts forward-compat SUP-013+ (regex does not cap cardinality)', () => {
    expect(InvariantCodeSchema.safeParse('SUP-013').success).toBe(true);
    expect(InvariantCodeSchema.safeParse('SUP-999').success).toBe(true);
  });

  it('continues to accept pre-existing prefix codes', () => {
    for (const code of [
      'AUTH-001',
      'EVID-001',
      'MEM-001',
      'CHAIN-001',
      'ISO-001',
      'PRV-001',
      'OPCTL-001',
      'START-003',
      'ESC-001',
      'MAO-001',
      'GTM-001',
      'POL-001',
      'WMODE-001',
      'PCP-001',
      'ING-001',
      'FR-001',
    ] as const) {
      expect(InvariantCodeSchema.safeParse(code).success).toBe(true);
    }
  });

  it('rejects malformed variants', () => {
    expect(InvariantCodeSchema.safeParse('sup-001').success).toBe(false); // lowercase
    expect(InvariantCodeSchema.safeParse('SUP_001').success).toBe(false); // underscore
    expect(InvariantCodeSchema.safeParse('SUP-').success).toBe(false); // no suffix
    expect(InvariantCodeSchema.safeParse('SUPX-001').success).toBe(false); // unknown prefix
    expect(InvariantCodeSchema.safeParse('SUP-abc').success).toBe(false); // non-uppercase suffix
  });
});
