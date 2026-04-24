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
  ConfirmationTier,
} from '@nous/shared';
import {
  ConfirmationProofSchema,
  ConfirmationProofRequestSchema,
} from '@nous/shared';

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
 * Returns required confirmation tier for action. Per operator-control-architecture-v1.
 */
export function getRequiredTier(action: ControlAction): ConfirmationTier {
  if (action === 'hard_stop' || action === 'resume') return 'T3';
  if (action === 'cancel' || action === 'revert_to_previous_state' || action === 'edit_submitted_prompt') return 'T2';
  if (action === 'pause' || action === 'stop_response' || action === 'retry_step') return 'T1';
  return 'T0';
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
// Presentation metadata for confirmation-tier display. Implementation lands
// in SP 7; this sub-phase only ships the type, constant, and stub.

/**
 * Presentation metadata for a confirmation tier — drives tier-display UI
 * (severity pill, rationale copy, T3 cooldown). Per Decision #9 § 9c.
 */
export type ConfirmationTierDisplay = {
  level: ConfirmationTier;
  label: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  rationaleKey: string;
  /** Present on T3 only. */
  cooldownMs?: number;
};

/**
 * T3 cooldown duration, in milliseconds. V1 value is `0` (no cooldown wired);
 * SP 7 promotes this to the policy-configured value.
 */
export const T3_COOLDOWN_MS = 0;

/**
 * Returns presentation metadata for a confirmation tier. Per Decision #9 § 9c.
 *
 * WR-162 SP 7 replaces the SP 2 stub body with the 4-arm exhaustive switch.
 * `ConfirmationTier` is a closed Zod enum (`'T0' | 'T1' | 'T2' | 'T3'`);
 * TypeScript exhaustiveness covers all four arms at compile time — a future
 * `'T4'` widening of `ConfirmationTierSchema` surfaces as a compile-time
 * exhaustiveness error at this switch (the correct contract-defect surface).
 */
export function getTierDisplay(
  tier: ConfirmationTier,
): ConfirmationTierDisplay {
  switch (tier) {
    case 'T0':
      return {
        level: 'T0',
        label: 'Immediate',
        severity: 'low',
        rationaleKey: 'tier.t0.rationale',
      };
    case 'T1':
      return {
        level: 'T1',
        label: 'Confirmation',
        severity: 'medium',
        rationaleKey: 'tier.t1.rationale',
      };
    case 'T2':
      return {
        level: 'T2',
        label: 'Two-step',
        severity: 'high',
        rationaleKey: 'tier.t2.rationale',
      };
    case 'T3':
      return {
        level: 'T3',
        label: 'Cooldown-gated',
        severity: 'critical',
        rationaleKey: 'tier.t3.rationale',
        cooldownMs: T3_COOLDOWN_MS,
      };
  }
}
