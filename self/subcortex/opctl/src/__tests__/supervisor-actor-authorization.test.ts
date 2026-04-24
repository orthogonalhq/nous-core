/**
 * WR-162 SP 5 — UT-OP3 — supervisor-actor authorization allowlist
 * (SUPV-SP5-011).
 *
 * Negative coverage (8 rows): each forbidden action returns
 * `status: 'rejected'`, `reason_code: 'supervisor_actor_forbidden_action'`.
 * Positive coverage (3 rows): allowlisted actions proceed past the
 * authorization gate (assertion = the rejection path does NOT fire).
 * For the positive rows we construct a scope/tier proof and assert we
 * reach a non-`supervisor_actor_forbidden_action` outcome — the actual
 * downstream result can be any of `applied` / `blocked` / `rejected`
 * depending on the action's own tier requirements; the assertion we
 * pin is solely "the gate let us through".
 */
import { describe, it, expect } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import type {
  ControlAction,
  ControlCommandEnvelope,
  ProjectId,
} from '@nous/shared';
import {
  OpctlService,
  InMemoryReplayStore,
  InMemoryStartLockStore,
  InMemoryScopeLockStore,
  InMemoryProjectControlStateStore,
  issueSupervisorProof,
} from '../index.js';
import type { WitnessEvent } from '@nous/shared';

function mockWitnessService(): import('@nous/shared').IWitnessService {
  return {
    appendAuthorization: async () =>
      ({ id: randomUUID() as import('@nous/shared').WitnessEventId, sequence: 1 } as WitnessEvent),
    appendCompletion: async () =>
      ({ id: randomUUID() as import('@nous/shared').WitnessEventId, sequence: 2 } as WitnessEvent),
    appendInvariant: async () => ({} as WitnessEvent),
    createCheckpoint: async () => ({} as import('@nous/shared').WitnessCheckpoint),
    rotateKeyEpoch: async () => 1,
    verify: async () => ({} as import('@nous/shared').VerificationReport),
    getReport: async () => null,
    listReports: async () => [],
    getLatestCheckpoint: async () => null,
  };
}

const HASH = createHash('sha256').update('payload').digest('hex');
const PROJECT_ID = randomUUID() as ProjectId;

function envelope(
  action: ControlAction,
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
    action,
    payload: { sup_code: 'SUP-001', severity: 'S0' },
    ...overrides,
  };
}

function makeService(): OpctlService {
  return new OpctlService({
    replayStore: new InMemoryReplayStore(),
    startLockStore: new InMemoryStartLockStore(),
    scopeLockStore: new InMemoryScopeLockStore(),
    projectControlStateStore: new InMemoryProjectControlStateStore(),
    witnessService: mockWitnessService(),
  });
}

describe('OpctlService — supervisor-actor authorization (UT-OP3)', () => {
  const FORBIDDEN: ControlAction[] = [
    'resume',
    'cancel',
    'retry',
    'retry_step',
    'revert',
    'revert_to_previous_state',
    'edit',
    'edit_submitted_prompt',
  ];

  for (const action of FORBIDDEN) {
    it(`rejects supervisor-actor ${action} with supervisor_actor_forbidden_action`, async () => {
      const svc = makeService();
      const env = envelope(action);
      // Provide a proof so the tier gate does not fire first. The
      // authorization gate must reject BEFORE the tier gate.
      const proof = issueSupervisorProof(action, env.scope);
      const result = await svc.submitCommand(env, proof);
      expect(result.status).toBe('rejected');
      expect(result.reason_code).toBe('supervisor_actor_forbidden_action');
    });
  }

  const ALLOWED: ControlAction[] = ['hard_stop', 'pause', 'stop_response'];

  for (const action of ALLOWED) {
    it(`allows supervisor-actor ${action} past the authorization gate`, async () => {
      const svc = makeService();
      const env = envelope(action);
      const proof = issueSupervisorProof(action, env.scope);
      const result = await svc.submitCommand(env, proof);
      // Regardless of downstream outcome, the authorization gate must
      // not be what rejects this command.
      expect(result.reason_code).not.toBe('supervisor_actor_forbidden_action');
    });
  }
});
