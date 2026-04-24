/**
 * WR-162 SP 5 — UT-OP2 — `issueSupervisorProof` helper (SUPV-SP5-004 path (b)).
 *
 * Asserts the proof round-trips at `validateConfirmationProof` with a
 * scope-bound + action-bound envelope, and fails on cross-scope,
 * cross-action, and TTL-expired mismatches. Confirms the "converge at
 * runtime on the existing gate" invariant named in the SDS.
 */
import { describe, it, expect, vi } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import type { ControlCommandEnvelope, ProjectId } from '@nous/shared';
import {
  issueSupervisorProof,
  validateConfirmationProof,
} from '../confirmation.js';

const PROJECT_ID = randomUUID() as ProjectId;
const PROJECT_ID_OTHER = randomUUID() as ProjectId;
const HASH = createHash('sha256').update('payload').digest('hex');

function envelope(
  overrides: Partial<ControlCommandEnvelope> = {},
): ControlCommandEnvelope {
  const now = new Date().toISOString();
  const later = new Date(Date.now() + 60000).toISOString();
  return {
    control_command_id: randomUUID() as import('@nous/shared').ControlCommandId,
    actor_type: 'supervisor',
    actor_id: randomUUID(),
    actor_session_id: randomUUID(),
    actor_seq: 1,
    nonce: randomUUID(),
    issued_at: now,
    expires_at: later,
    scope: {
      class: 'project_run_scope',
      kind: 'project_run',
      target_ids: [],
      project_id: PROJECT_ID,
    },
    payload_hash: HASH,
    command_signature: 'stub-sig',
    action: 'hard_stop',
    ...overrides,
  };
}

describe('issueSupervisorProof (UT-OP2)', () => {
  it('round-trips: proof validates against a scope-bound + action-bound envelope', () => {
    const env = envelope({ action: 'hard_stop' });
    const proof = issueSupervisorProof('hard_stop', env.scope);
    expect(validateConfirmationProof(proof, env)).toBe(true);
  });

  it('rejects cross-scope — proof bound to project A; envelope on project B', () => {
    const envA = envelope({ action: 'hard_stop' });
    const proof = issueSupervisorProof('hard_stop', envA.scope);
    const envB = envelope({
      action: 'hard_stop',
      scope: {
        class: 'project_run_scope',
        kind: 'project_run',
        target_ids: [],
        project_id: PROJECT_ID_OTHER,
      },
    });
    expect(validateConfirmationProof(proof, envB)).toBe(false);
  });

  it('rejects cross-action — proof bound to hard_stop; envelope action is pause', () => {
    const env = envelope({ action: 'hard_stop' });
    const proof = issueSupervisorProof('hard_stop', env.scope);
    const envPause = envelope({ action: 'pause' });
    // envPause has a different nonce/command_id; scope is identical by
    // construction (default PROJECT_ID). Proof fails action-binding.
    expect(validateConfirmationProof(proof, envPause)).toBe(false);
  });

  it('rejects TTL-expired proof (> 5 min old)', () => {
    vi.useFakeTimers();
    const start = new Date('2026-04-22T12:00:00.000Z');
    vi.setSystemTime(start);
    const env = envelope({ action: 'hard_stop', issued_at: start.toISOString() });
    const proof = issueSupervisorProof('hard_stop', env.scope);
    // Advance beyond the 5-minute PROOF_TTL_MS.
    vi.setSystemTime(new Date(start.getTime() + 6 * 60 * 1000));
    expect(validateConfirmationProof(proof, env)).toBe(false);
    vi.useRealTimers();
  });
});
