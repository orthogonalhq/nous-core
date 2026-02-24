/**
 * Profile name normalization for Phase 2.3.
 *
 * Maps legacy profile names to canonical names. Backward compatibility preserved.
 */
import type { ProfileName } from './schema.js';

const LEGACY_TO_CANONICAL: Record<string, ProfileName> = {
  'local-only': 'local_strict',
  'remote-only': 'remote_primary',
  hybrid: 'hybrid_controlled',
  local_strict: 'local_strict',
  hybrid_controlled: 'hybrid_controlled',
  remote_primary: 'remote_primary',
};

/**
 * Normalize a profile name to its canonical form.
 * Legacy names (local-only, remote-only, hybrid) map to canonical (local_strict, remote_primary, hybrid_controlled).
 * Canonical names are returned unchanged.
 */
export function normalizeProfileName(name: string): ProfileName {
  const canonical = LEGACY_TO_CANONICAL[name];
  if (canonical) {
    return canonical;
  }
  return name as ProfileName;
}
