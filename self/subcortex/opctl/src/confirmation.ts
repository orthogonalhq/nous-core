/**
 * Confirmation proof issuance and validation.
 * OPCTL-003: Destructive controls require runtime-valid confirmation_proof.
 */
import { randomUUID, createHash } from 'node:crypto';
import type {
  ControlCommandEnvelope,
  ControlAction,
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
 * Returns presentation metadata for a confirmation tier.
 *
 * **Stub.** Implementation lands in SP 7. SP 2 ships the surface only so SP 7
 * and SP 14 can import from `@nous/subcortex-opctl`.
 */
export function getTierDisplay(
  _tier: ConfirmationTier,
): ConfirmationTierDisplay {
  throw new Error('not yet implemented');
}
