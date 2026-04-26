/**
 * WR-162 SP 7 — UT-SP7-IS1..IS3 — `issueSystemProof` helper (Decision #6 Variant B1).
 *
 * Mirrors the SP 5 `issueSupervisorProof` test structure (converge-at-runtime
 * on `validateConfirmationProof` + ConfirmationProofSchema shape) with the
 * SP 7 differences: distinct `signature: 'system-issued-stub-sig'` literal,
 * tier derivation via `getRequiredTier(action)` parameterized across all 11
 * ControlAction values.
 */
import { describe, it, expect } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import type {
  ControlAction,
  ControlCommandEnvelope,
  ControlScope,
  ProjectId,
} from '@nous/shared';
import { ConfirmationProofSchema } from '@nous/shared';
import {
  issueSystemProof,
  validateConfirmationProof,
} from '../confirmation.js';
import { getRequiredTier } from '../tier-display.js';

const PROJECT_ID = randomUUID() as ProjectId;
const HASH = createHash('sha256').update('payload').digest('hex');

function makeScope(): ControlScope {
  return {
    class: 'project_run_scope',
    kind: 'project_run',
    target_ids: [],
    project_id: PROJECT_ID,
  };
}

function envelope(
  overrides: Partial<ControlCommandEnvelope> = {},
): ControlCommandEnvelope {
  const now = new Date().toISOString();
  const later = new Date(Date.now() + 60000).toISOString();
  return {
    control_command_id: randomUUID() as import('@nous/shared').ControlCommandId,
    actor_type: 'system_agent',
    actor_id: randomUUID(),
    actor_session_id: randomUUID(),
    actor_seq: 0,
    nonce: randomUUID(),
    issued_at: now,
    expires_at: later,
    scope: makeScope(),
    payload_hash: HASH,
    command_signature: 'cost-governance-system-sig',
    action: 'pause',
    ...overrides,
  };
}

describe('issueSystemProof (UT-SP7-IS1..IS3)', () => {
  // UT-SP7-IS1 — shape + signature literal + schema round-trip
  it('returns a ConfirmationProof with signature="system-issued-stub-sig" and valid schema', () => {
    const scope = makeScope();
    const proof = issueSystemProof('pause', scope);

    // Schema round-trip
    const parsed = ConfirmationProofSchema.safeParse(proof);
    expect(parsed.success).toBe(true);

    // Signature literal distinguishes system-issued from human / supervisor paths.
    expect(proof.signature).toBe('system-issued-stub-sig');
    expect(proof.action).toBe('pause');
    // proof_id is a UUID
    expect(proof.proof_id).toMatch(/^[0-9a-f-]{36}$/);
    // 5-minute PROOF_TTL_MS window
    const issued = Date.parse(proof.issued_at);
    const expires = Date.parse(proof.expires_at);
    expect(expires - issued).toBe(5 * 60 * 1000);
  });

  // UT-SP7-IS2 — tier derivation parameterized across all 11 ControlAction values
  it.each<ControlAction>([
    'pause',
    'resume',
    'cancel',
    'hard_stop',
    'revert',
    'retry',
    'edit',
    'stop_response',
    'retry_step',
    'revert_to_previous_state',
    'edit_submitted_prompt',
  ])('derives tier via getRequiredTier for action=%s', (action) => {
    const proof = issueSystemProof(action, makeScope());
    expect(proof.tier).toBe(getRequiredTier(action));
  });

  // UT-SP7-IS3 — runtime convergence on validateConfirmationProof
  it('round-trips: proof validates against scope-bound + action-bound envelope', () => {
    const env = envelope({ action: 'pause' });
    const proof = issueSystemProof('pause', env.scope);
    expect(validateConfirmationProof(proof, env)).toBe(true);
  });
});
