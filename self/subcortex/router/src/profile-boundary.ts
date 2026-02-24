/**
 * Profile boundary enforcement for Phase 2.3.
 *
 * local_strict: no remote providers
 * hybrid_controlled: remote allowed only as explicit fallback
 * remote_primary: local allowed only when explicitly configured
 */
import type { Profile } from '@nous/autonomic-config';
import type { ProviderConfigEntry } from '@nous/autonomic-config';

/**
 * Check if a provider is allowed under the given profile.
 */
export function isProviderAllowedByProfile(
  profile: Profile,
  provider: ProviderConfigEntry,
  isFallback: boolean
): boolean {
  const name = profile.name;

  if (name === 'local_strict' || name === 'local-only') {
    return provider.isLocal;
  }

  if (name === 'remote_primary' || name === 'remote-only') {
    if (provider.isLocal) {
      return false;
    }
    return true;
  }

  if (name === 'hybrid_controlled' || name === 'hybrid') {
    if (provider.isLocal) {
      return profile.allowLocalProviders ?? true;
    }
    if (isFallback) {
      return profile.allowRemoteProviders ?? true;
    }
    if (profile.allowSilentLocalToRemoteFailover) {
      return profile.allowRemoteProviders ?? true;
    }
    return false;
  }

  return true;
}
