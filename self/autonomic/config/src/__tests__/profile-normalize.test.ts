import { describe, it, expect } from 'vitest';
import { normalizeProfileName } from '../profile-normalize.js';

describe('normalizeProfileName', () => {
  describe('Tier 1 — Contract: legacy → canonical', () => {
    it('maps local-only to local_strict', () => {
      expect(normalizeProfileName('local-only')).toBe('local_strict');
    });

    it('maps remote-only to remote_primary', () => {
      expect(normalizeProfileName('remote-only')).toBe('remote_primary');
    });

    it('maps hybrid to hybrid_controlled', () => {
      expect(normalizeProfileName('hybrid')).toBe('hybrid_controlled');
    });

    it('leaves canonical names unchanged', () => {
      expect(normalizeProfileName('local_strict')).toBe('local_strict');
      expect(normalizeProfileName('hybrid_controlled')).toBe('hybrid_controlled');
      expect(normalizeProfileName('remote_primary')).toBe('remote_primary');
    });
  });

  describe('Tier 2 — Behavior: all six profile names', () => {
    it('normalizes all legacy names to correct canonical', () => {
      expect(normalizeProfileName('local-only')).toBe('local_strict');
      expect(normalizeProfileName('remote-only')).toBe('remote_primary');
      expect(normalizeProfileName('hybrid')).toBe('hybrid_controlled');
    });

    it('returns canonical names unchanged', () => {
      expect(normalizeProfileName('local_strict')).toBe('local_strict');
      expect(normalizeProfileName('hybrid_controlled')).toBe('hybrid_controlled');
      expect(normalizeProfileName('remote_primary')).toBe('remote_primary');
    });
  });

  describe('unknown profile names', () => {
    it('returns unknown names as-is (passthrough)', () => {
      expect(normalizeProfileName('custom_profile')).toBe('custom_profile');
    });
  });
});
