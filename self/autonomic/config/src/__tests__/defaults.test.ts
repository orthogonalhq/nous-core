import { describe, it, expect } from 'vitest';
import {
  PfcTierPresetSchema,
  ProfileSchema,
  SystemConfigSchema,
} from '../schema.js';
import {
  DEFAULT_PFC_TIER_PRESETS,
  DEFAULT_PROFILES,
  DEFAULT_SYSTEM_CONFIG,
} from '../defaults.js';

describe('DEFAULT_PFC_TIER_PRESETS', () => {
  it('contains exactly 6 presets (tiers 0–5)', () => {
    expect(DEFAULT_PFC_TIER_PRESETS).toHaveLength(6);
  });

  it('covers all tiers 0 through 5', () => {
    const tiers = DEFAULT_PFC_TIER_PRESETS.map((p) => p.tier);
    expect(tiers).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it.each(DEFAULT_PFC_TIER_PRESETS)(
    'tier $tier validates against PfcTierPresetSchema',
    (preset) => {
      expect(PfcTierPresetSchema.safeParse(preset).success).toBe(true);
    },
  );

  it('tier 0 has no orchestration capabilities', () => {
    const tier0 = DEFAULT_PFC_TIER_PRESETS[0]!;
    expect(tier0.reflection).toBe('none');
    expect(tier0.memoryGating).toBe(false);
    expect(tier0.toolAuthorization).toBe(false);
    expect(tier0.planning).toBe(false);
  });

  it('tier 5 has full capabilities', () => {
    const tier5 = DEFAULT_PFC_TIER_PRESETS[5]!;
    expect(tier5.reflection).toBe('advanced');
    expect(tier5.memoryGating).toBe(true);
    expect(tier5.toolAuthorization).toBe(true);
    expect(tier5.planning).toBe(true);
    expect(tier5.escalationDetection).toBe(true);
  });

  it('escalation detection starts at tier 3', () => {
    expect(DEFAULT_PFC_TIER_PRESETS[0]!.escalationDetection).toBe(false);
    expect(DEFAULT_PFC_TIER_PRESETS[1]!.escalationDetection).toBe(false);
    expect(DEFAULT_PFC_TIER_PRESETS[2]!.escalationDetection).toBe(false);
    expect(DEFAULT_PFC_TIER_PRESETS[3]!.escalationDetection).toBe(true);
  });

  it('planning starts at tier 4', () => {
    expect(DEFAULT_PFC_TIER_PRESETS[3]!.planning).toBe(false);
    expect(DEFAULT_PFC_TIER_PRESETS[4]!.planning).toBe(true);
  });
});

describe('DEFAULT_PROFILES', () => {
  it('contains local-only, remote-only, and hybrid', () => {
    expect(Object.keys(DEFAULT_PROFILES)).toEqual(
      expect.arrayContaining(['local-only', 'remote-only', 'hybrid']),
    );
  });

  it.each(Object.entries(DEFAULT_PROFILES))(
    'profile "%s" validates against ProfileSchema',
    (_name, profile) => {
      expect(ProfileSchema.safeParse(profile).success).toBe(true);
    },
  );

  it('local-only disallows remote providers', () => {
    expect(DEFAULT_PROFILES['local-only']!.allowRemoteProviders).toBe(false);
    expect(DEFAULT_PROFILES['local-only']!.allowLocalProviders).toBe(true);
  });

  it('remote-only disallows local providers', () => {
    expect(DEFAULT_PROFILES['remote-only']!.allowLocalProviders).toBe(false);
    expect(DEFAULT_PROFILES['remote-only']!.allowRemoteProviders).toBe(true);
  });

  it('hybrid allows both', () => {
    expect(DEFAULT_PROFILES['hybrid']!.allowLocalProviders).toBe(true);
    expect(DEFAULT_PROFILES['hybrid']!.allowRemoteProviders).toBe(true);
  });
});

describe('DEFAULT_SYSTEM_CONFIG', () => {
  it('validates against SystemConfigSchema', () => {
    expect(SystemConfigSchema.safeParse(DEFAULT_SYSTEM_CONFIG).success).toBe(true);
  });

  it('uses local-only profile by default', () => {
    expect(DEFAULT_SYSTEM_CONFIG.profile.name).toBe('local-only');
  });

  it('defaults to PFC tier 2', () => {
    expect(DEFAULT_SYSTEM_CONFIG.pfcTier).toBe(2);
  });

  it('defaults to sqlite document backend', () => {
    expect(DEFAULT_SYSTEM_CONFIG.storage.documentBackend).toBe('sqlite');
  });

  it('defaults to stub vector and graph backends', () => {
    expect(DEFAULT_SYSTEM_CONFIG.storage.vectorBackend).toBe('stub');
    expect(DEFAULT_SYSTEM_CONFIG.storage.graphBackend).toBe('stub');
  });
});
