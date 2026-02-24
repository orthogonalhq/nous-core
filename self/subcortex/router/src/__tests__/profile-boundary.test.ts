import { describe, it, expect } from 'vitest';
import { isProviderAllowedByProfile } from '../profile-boundary.js';
import type { Profile, ProviderConfigEntry } from '@nous/autonomic-config';

const LOCAL_PROVIDER: ProviderConfigEntry = {
  id: '00000000-0000-0000-0000-000000000001' as any,
  name: 'Local',
  type: 'text',
  modelId: 'local',
  isLocal: true,
  capabilities: ['text'],
};

const REMOTE_PROVIDER: ProviderConfigEntry = {
  id: '00000000-0000-0000-0000-000000000002' as any,
  name: 'Remote',
  type: 'text',
  modelId: 'gpt-4',
  isLocal: false,
  capabilities: ['text'],
};

describe('isProviderAllowedByProfile', () => {
  describe('local_strict', () => {
    it('allows local provider', () => {
      const profile: Profile = {
        name: 'local_strict',
        description: 'Local only',
        defaultProviderType: 'local',
        allowLocalProviders: true,
        allowRemoteProviders: false,
        allowSilentLocalToRemoteFailover: false,
      };
      expect(
        isProviderAllowedByProfile(profile, LOCAL_PROVIDER, false),
      ).toBe(true);
    });

    it('rejects remote provider', () => {
      const profile: Profile = {
        name: 'local_strict',
        description: 'Local only',
        defaultProviderType: 'local',
        allowLocalProviders: true,
        allowRemoteProviders: false,
        allowSilentLocalToRemoteFailover: false,
      };
      expect(
        isProviderAllowedByProfile(profile, REMOTE_PROVIDER, false),
      ).toBe(false);
    });

    it('rejects remote even as fallback', () => {
      const profile: Profile = {
        name: 'local_strict',
        description: 'Local only',
        defaultProviderType: 'local',
        allowLocalProviders: true,
        allowRemoteProviders: false,
        allowSilentLocalToRemoteFailover: false,
      };
      expect(
        isProviderAllowedByProfile(profile, REMOTE_PROVIDER, true),
      ).toBe(false);
    });
  });

  describe('remote_primary', () => {
    it('allows remote provider', () => {
      const profile: Profile = {
        name: 'remote_primary',
        description: 'Remote primary',
        defaultProviderType: 'remote',
        allowLocalProviders: false,
        allowRemoteProviders: true,
        allowSilentLocalToRemoteFailover: false,
      };
      expect(
        isProviderAllowedByProfile(profile, REMOTE_PROVIDER, false),
      ).toBe(true);
    });

    it('rejects local provider', () => {
      const profile: Profile = {
        name: 'remote_primary',
        description: 'Remote primary',
        defaultProviderType: 'remote',
        allowLocalProviders: false,
        allowRemoteProviders: true,
        allowSilentLocalToRemoteFailover: false,
      };
      expect(
        isProviderAllowedByProfile(profile, LOCAL_PROVIDER, false),
      ).toBe(false);
    });
  });

  describe('hybrid_controlled', () => {
    it('allows local as primary when allowLocalProviders', () => {
      const profile: Profile = {
        name: 'hybrid_controlled',
        description: 'Hybrid',
        defaultProviderType: 'local',
        allowLocalProviders: true,
        allowRemoteProviders: true,
        allowSilentLocalToRemoteFailover: false,
      };
      expect(
        isProviderAllowedByProfile(profile, LOCAL_PROVIDER, false),
      ).toBe(true);
    });

    it('allows remote as fallback when allowRemoteProviders', () => {
      const profile: Profile = {
        name: 'hybrid_controlled',
        description: 'Hybrid',
        defaultProviderType: 'local',
        allowLocalProviders: true,
        allowRemoteProviders: true,
        allowSilentLocalToRemoteFailover: false,
      };
      expect(
        isProviderAllowedByProfile(profile, REMOTE_PROVIDER, true),
      ).toBe(true);
    });

    it('rejects remote as primary when not silent failover', () => {
      const profile: Profile = {
        name: 'hybrid_controlled',
        description: 'Hybrid',
        defaultProviderType: 'local',
        allowLocalProviders: true,
        allowRemoteProviders: true,
        allowSilentLocalToRemoteFailover: false,
      };
      expect(
        isProviderAllowedByProfile(profile, REMOTE_PROVIDER, false),
      ).toBe(false);
    });

    it('allows remote as primary when allowSilentLocalToRemoteFailover', () => {
      const profile: Profile = {
        name: 'hybrid_controlled',
        description: 'Hybrid',
        defaultProviderType: 'local',
        allowLocalProviders: true,
        allowRemoteProviders: true,
        allowSilentLocalToRemoteFailover: true,
      };
      expect(
        isProviderAllowedByProfile(profile, REMOTE_PROVIDER, false),
      ).toBe(true);
    });
  });

  describe('legacy names', () => {
    it('local-only behaves like local_strict', () => {
      const profile: Profile = {
        name: 'local-only',
        description: 'Legacy',
        defaultProviderType: 'local',
        allowLocalProviders: true,
        allowRemoteProviders: false,
        allowSilentLocalToRemoteFailover: false,
      };
      expect(
        isProviderAllowedByProfile(profile, LOCAL_PROVIDER, false),
      ).toBe(true);
      expect(
        isProviderAllowedByProfile(profile, REMOTE_PROVIDER, false),
      ).toBe(false);
    });

    it('remote-only behaves like remote_primary', () => {
      const profile: Profile = {
        name: 'remote-only',
        description: 'Legacy',
        defaultProviderType: 'remote',
        allowLocalProviders: false,
        allowRemoteProviders: true,
        allowSilentLocalToRemoteFailover: false,
      };
      expect(
        isProviderAllowedByProfile(profile, REMOTE_PROVIDER, false),
      ).toBe(true);
      expect(
        isProviderAllowedByProfile(profile, LOCAL_PROVIDER, false),
      ).toBe(false);
    });
  });
});
