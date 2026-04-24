/**
 * WR-162 SP 5 — UT-SH1 — `WitnessActorSchema` widening (SUPV-SP5-007).
 *
 * Asserts the additive `'supervisor'` literal parses successfully and
 * every pre-existing literal still parses (regression floor for the
 * widening). Extends (does not replace) the SP 4 evidence tests.
 */
import { describe, it, expect } from 'vitest';
import { WitnessActorSchema } from '../../types/evidence.js';

describe('WitnessActorSchema — SP 5 widening (UT-SH1)', () => {
  it('accepts the new "supervisor" literal', () => {
    const parsed = WitnessActorSchema.safeParse('supervisor');
    expect(parsed.success).toBe(true);
  });

  it('still accepts every pre-existing literal post-widening (regression floor)', () => {
    const preExisting = [
      'core',
      'pfc',
      'subcortex',
      'app',
      'principal',
      'system',
      'orchestration_agent',
      'worker_agent',
    ] as const;
    for (const literal of preExisting) {
      const parsed = WitnessActorSchema.safeParse(literal);
      expect(parsed.success, `expected ${literal} to parse post-widening`).toBe(
        true,
      );
    }
  });

  it('rejects an invalid literal (closed-enum invariant preserved)', () => {
    const parsed = WitnessActorSchema.safeParse('sup');
    expect(parsed.success).toBe(false);
  });
});
