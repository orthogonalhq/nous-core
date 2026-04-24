import { describe, expect, it } from 'vitest';
import {
  T3_COOLDOWN_MS,
  getTierDisplay,
  type ConfirmationTierDisplay,
} from '../confirmation.js';

describe('ConfirmationTierDisplay — WR-162 SP 2 surface', () => {
  it('accepts a structurally valid literal (type-level compile guard)', () => {
    const x: ConfirmationTierDisplay = {
      level: 'T3',
      label: 'Cooldown-gated',
      severity: 'critical',
      rationaleKey: 'reco.t3.cooldown',
      cooldownMs: 0,
    };
    expect(x.level).toBe('T3');
    expect(x.cooldownMs).toBe(0);
  });

  it('omits cooldownMs when not applicable (T0-T2)', () => {
    const x: ConfirmationTierDisplay = {
      level: 'T1',
      label: 'Confirmation',
      severity: 'low',
      rationaleKey: 'reco.t1.confirm',
    };
    expect(x.cooldownMs).toBeUndefined();
  });
});

describe('T3_COOLDOWN_MS', () => {
  // UT-SP7-TD5: T3_COOLDOWN_MS constant assertion (V1 default).
  it('ships with value 0 in V1 (post-V1 sprint can flip without breaking shape)', () => {
    expect(T3_COOLDOWN_MS).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// WR-162 SP 7 — getTierDisplay real implementation (UT-SP7-TD1..TD4)
// Replaces the SP 2 stub-throw negative tests per Goals In Scope #8 flip rule.
// ---------------------------------------------------------------------------

describe('getTierDisplay — WR-162 SP 7 real implementation', () => {
  // UT-SP7-TD1
  it('returns the T0 shape (Immediate / low severity, no cooldownMs)', () => {
    expect(getTierDisplay('T0')).toEqual({
      level: 'T0',
      label: 'Immediate',
      severity: 'low',
      rationaleKey: 'tier.t0.rationale',
    });
  });

  // UT-SP7-TD2
  it('returns the T1 shape (Confirmation / medium severity, no cooldownMs)', () => {
    expect(getTierDisplay('T1')).toEqual({
      level: 'T1',
      label: 'Confirmation',
      severity: 'medium',
      rationaleKey: 'tier.t1.rationale',
    });
  });

  // UT-SP7-TD3
  it('returns the T2 shape (Two-step / high severity, no cooldownMs)', () => {
    expect(getTierDisplay('T2')).toEqual({
      level: 'T2',
      label: 'Two-step',
      severity: 'high',
      rationaleKey: 'tier.t2.rationale',
    });
  });

  // UT-SP7-TD4
  it('returns the T3 shape (Cooldown-gated / critical severity, cooldownMs = T3_COOLDOWN_MS)', () => {
    expect(getTierDisplay('T3')).toEqual({
      level: 'T3',
      label: 'Cooldown-gated',
      severity: 'critical',
      rationaleKey: 'tier.t3.rationale',
      cooldownMs: T3_COOLDOWN_MS,
    });
  });
});
