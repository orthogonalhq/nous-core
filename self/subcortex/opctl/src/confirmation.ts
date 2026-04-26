/**
 * Confirmation proof issuance and validation.
 * OPCTL-003: Destructive controls require runtime-valid confirmation_proof.
 */
import { randomUUID, createHash } from 'node:crypto';
import type {
  ControlCommandEnvelope,
  ControlAction,
  ControlScope,
  ConfirmationProof,
  ConfirmationProofRequest,
} from '@nous/shared';
import {
  ConfirmationProofSchema,
  ConfirmationProofRequestSchema,
} from '@nous/shared';
import { getRequiredTier } from './tier-display.js';

const PROOF_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Issues a runtime confirmation proof. Short-lived, scope-bound, action-bound.
 */
export function issueConfirmationProof(
  params: ConfirmationProofRequest,
): ConfirmationProof {
  const parsed = ConfirmationProofRequestSchema.parse(params);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PROOF_TTL_MS);

  const scopeHash = hashScope(parsed.scope);

  return ConfirmationProofSchema.parse({
    proof_id: randomUUID(),
    issued_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    scope_hash: scopeHash,
    action: parsed.action,
    tier: parsed.tier,
    signature: 'stub-sig', // Phase 2.5: stub
  });
}

/**
 * Validates confirmation proof against envelope. Scope-bound, action-bound, not expired.
 */
export function validateConfirmationProof(
  proof: ConfirmationProof,
  envelope: ControlCommandEnvelope,
): boolean {
  const now = new Date().toISOString();
  if (proof.expires_at < now) return false;
  if (proof.action !== envelope.action) return false;

  const envelopeScopeHash = hashScope(envelope.scope);
  if (proof.scope_hash !== envelopeScopeHash) return false;

  return true;
}

function hashScope(scope: { class: string; kind: string; target_ids?: string[]; project_id?: string }): string {
  const str = JSON.stringify({
    class: scope.class,
    kind: scope.kind,
    target_ids: scope.target_ids ?? [],
    project_id: scope.project_id ?? null,
  });
  return createHash('sha256').update(str).digest('hex');
}

/**
 * WR-162 SP 5 — supervisor-tier proof-issuance helper (SUPV-SP5-004 path (b)).
 *
 * Thin wrapper over `issueConfirmationProof({ action, scope, tier })` that
 * uses the same `getRequiredTier(action)` tier lookup every principal-
 * authored proof flows through. This is the **first production caller**
 * path for supervisor enforcement: `enforce(...)` in
 * `@nous/subcortex-supervisor` imports this helper via the `ProofIssuer`
 * DI seam wired at bootstrap.
 *
 * Policy citation: `supervisor-escalation-policy-v1.md § Special Notes`
 * — supervisor commands carry a `ConfirmationProof` that converges at
 * runtime on the same `validateConfirmationProof` gate every actor goes
 * through. Path (a) would reuse `issueSystemProof`; SP 5 picks path (b)
 * because `issueSystemProof` does not exist yet (SP 7 lands it). When
 * SP 7 ships, the `bootstrap.ts` wiring swaps the closure in one line;
 * this helper may be migrated or kept alongside `issueSystemProof`.
 */
export function issueSupervisorProof(
  action: ControlAction,
  scope: ControlScope,
): ConfirmationProof {
  return issueConfirmationProof({
    action,
    scope,
    tier: getRequiredTier(action),
  });
}

/**
 * WR-162 SP 7 — system-actor proof-issuance helper (Decision #6 Variant B1).
 *
 * Used by `CostEnforcement.triggerPause()` and future system-auto-issued
 * opctl commands to carry a valid `ConfirmationProof` through
 * `validateConfirmationProof` like every other actor — preserving the
 * OPCTL-003 invariant that destructive controls require runtime-valid
 * confirmation_proof.
 *
 * **Not a delegate of `issueConfirmationProof`.** Builds the proof body
 * directly so the `signature: 'system-issued-stub-sig'` literal remains
 * distinct from `issueConfirmationProof`'s `'stub-sig'` and from any
 * signature `issueSupervisorProof` inherits via delegation. Distinct
 * signature literals provide provenance in the witness trail until
 * Matrix #46 lands cryptographic signing in lockstep for all three
 * helpers.
 */
export function issueSystemProof(
  action: ControlAction,
  scope: ControlScope,
): ConfirmationProof {
  const tier = getRequiredTier(action);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PROOF_TTL_MS);
  const scopeHash = hashScope(scope);
  return ConfirmationProofSchema.parse({
    proof_id: randomUUID(),
    issued_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    scope_hash: scopeHash,
    action,
    tier,
    signature: 'system-issued-stub-sig',
  });
}

// --- WR-162 SP 2 additions — failure-recovery-ux-patterns-v1.md § 9c ---
//
// Presentation metadata for confirmation-tier display moved to ./tier-display.ts
// per WR-162 SP 14 SUPV-SP14-021 (renderer-safe extraction). The package barrel
// re-exports `ConfirmationTierDisplay`, `T3_COOLDOWN_MS`, `getRequiredTier`,
// and `getTierDisplay` from `./tier-display.js` directly.
