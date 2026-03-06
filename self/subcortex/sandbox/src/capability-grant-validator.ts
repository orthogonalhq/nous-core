/**
 * Capability grant validator with anti-replay checks.
 */
import type {
  CapabilityGrant,
  PackageLifecycleReasonCode,
  SandboxPayload,
} from '@nous/shared';
import type { GrantReplayStore } from './grant-replay-store.js';

export interface CapabilityValidationResult {
  ok: boolean;
  reasonCode?: PackageLifecycleReasonCode;
}

const isExpired = (grant: CapabilityGrant, now: Date): boolean => {
  const expiresAt = new Date(grant.expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= now.getTime();
};

export const validateCapabilityGrant = (
  payload: SandboxPayload,
  replayStore: GrantReplayStore,
  now: Date,
): CapabilityValidationResult => {
  const grant = payload.capability_grant;

  if (!grant) {
    return { ok: false, reasonCode: 'PKG-002-CAPABILITY_NOT_GRANTED' };
  }

  if (grant.status !== 'active') {
    if (grant.status === 'expired') {
      return { ok: false, reasonCode: 'PKG-002-CAPABILITY_GRANT_EXPIRED' };
    }
    return { ok: false, reasonCode: 'PKG-002-CAPABILITY_NOT_GRANTED' };
  }

  if (isExpired(grant, now)) {
    return { ok: false, reasonCode: 'PKG-002-CAPABILITY_GRANT_EXPIRED' };
  }

  if (
    grant.package_id !== payload.package_id ||
    grant.project_id !== payload.runtime.project_id ||
    grant.capability !== payload.action.requested_capability
  ) {
    return { ok: false, reasonCode: 'PKG-002-CAPABILITY_SCOPE_MISMATCH' };
  }

  if (!grant.scope.action_surfaces.includes(payload.action.surface)) {
    return { ok: false, reasonCode: 'PKG-002-CAPABILITY_SCOPE_MISMATCH' };
  }

  if (
    grant.scope.action_names &&
    !grant.scope.action_names.includes(payload.action.action)
  ) {
    return { ok: false, reasonCode: 'PKG-002-CAPABILITY_SCOPE_MISMATCH' };
  }

  const scopeKey = `${payload.package_id}::${payload.runtime.project_id}::${payload.action.requested_capability}`;
  const isScopedNonceNew = replayStore.registerScopedNonce(scopeKey, grant.nonce);
  const isGrantNonceNew = replayStore.registerGrantNonce(grant.grant_id, grant.nonce);

  if (!isScopedNonceNew || !isGrantNonceNew) {
    return { ok: false, reasonCode: 'PKG-002-CAPABILITY_REPLAY_DETECTED' };
  }

  return { ok: true };
};

