/**
 * UT-TR1 — Supervisor ↔ Witnessd enforcement-action translator.
 */
import { describe, expect, it } from 'vitest';
import {
  fromWitnessdEnforcement,
  toWitnessdEnforcement,
} from '../enforcement-action-translator.js';

describe('toWitnessdEnforcement (supervisor → witnessd)', () => {
  it('hard_stop → hard-stop', () => {
    expect(toWitnessdEnforcement('hard_stop')).toBe('hard-stop');
  });

  it('auto_pause → auto-pause', () => {
    expect(toWitnessdEnforcement('auto_pause')).toBe('auto-pause');
  });

  it('require_review → review', () => {
    expect(toWitnessdEnforcement('require_review')).toBe('review');
  });

  it('warn → warn (SP 6 widened EnforcementActionSchema)', () => {
    // WR-162 SP 6 (SUPV-SP6-009) — witnessd `EnforcementActionSchema` now
    // admits `'warn'`; the SP 4 deferral throw branch is closed.
    expect(toWitnessdEnforcement('warn')).toBe('warn');
  });
});

describe('fromWitnessdEnforcement (witnessd → supervisor)', () => {
  it('hard-stop → hard_stop', () => {
    expect(fromWitnessdEnforcement('hard-stop')).toBe('hard_stop');
  });

  it('auto-pause → auto_pause', () => {
    expect(fromWitnessdEnforcement('auto-pause')).toBe('auto_pause');
  });

  it('review → require_review', () => {
    expect(fromWitnessdEnforcement('review')).toBe('require_review');
  });

  it('warn → warn (SP 6 widened EnforcementActionSchema)', () => {
    expect(fromWitnessdEnforcement('warn')).toBe('warn');
  });
});

describe('round-trip', () => {
  it('hard_stop ↔ hard-stop', () => {
    expect(fromWitnessdEnforcement(toWitnessdEnforcement('hard_stop'))).toBe(
      'hard_stop',
    );
  });

  it('auto_pause ↔ auto-pause', () => {
    expect(fromWitnessdEnforcement(toWitnessdEnforcement('auto_pause'))).toBe(
      'auto_pause',
    );
  });

  it('require_review ↔ review', () => {
    expect(fromWitnessdEnforcement(toWitnessdEnforcement('require_review'))).toBe(
      'require_review',
    );
  });
});
