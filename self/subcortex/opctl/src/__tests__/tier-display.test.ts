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
  it('ships with value 0 in SP 2 (SP 7 promotes to policy-configured value)', () => {
    expect(T3_COOLDOWN_MS).toBe(0);
  });
});

describe('getTierDisplay — SP 2 stub', () => {
  it('throws "not yet implemented" for T0', () => {
    expect(() => getTierDisplay('T0')).toThrow('not yet implemented');
  });

  it('throws "not yet implemented" for T1', () => {
    expect(() => getTierDisplay('T1')).toThrow('not yet implemented');
  });

  it('throws "not yet implemented" for T2', () => {
    expect(() => getTierDisplay('T2')).toThrow('not yet implemented');
  });

  it('throws "not yet implemented" for T3', () => {
    expect(() => getTierDisplay('T3')).toThrow('not yet implemented');
  });
});
