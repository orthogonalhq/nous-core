/**
 * Credential lookup for Phase 2.3.
 *
 * Stub implementation: returns credentials from config or env.
 * Full secrets integration deferred.
 */
import type { CredentialLookupKey } from './schema.js';
import type { IConfig } from '@nous/shared';

/**
 * Look up credential for the given key.
 * Stub: returns from config or process.env. Returns null if not found.
 */
export function lookupCredential(
  _key: CredentialLookupKey,
  _config: IConfig
): string | null {
  // Stub: no credential store yet. Return null; providers use existing config.
  return null;
}
