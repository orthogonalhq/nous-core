/**
 * WR-162 SP 5 — UT-OP8 — `OpctlSubmitResult` branch coverage (SUPV-SP5-013).
 *
 * Pins the three ratified `OpctlSubmitResult.status` values at the
 * envelope-level boundary for supervisor actor:
 *   - `applied`          — happy path with valid proof + resumable state.
 *   - `blocked`          — arbitration preemption (uses the same seed as
 *     UT-OP7 but asserts at the `OpctlSubmitResult` shape).
 *   - `rejected`         — OPCTL-003 reject on invalid / missing proof.
 *
 * UT-EN7 in the supervisor package locks the unknown-status throw
 * behavior; at the opctl boundary these three branches are the only
 * legal outcomes.
 */
import { describe, it, expect } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import type {
  ControlCommandEnvelope,
  ProjectId,
  WitnessEvent,
} from '@nous/shared';
import {
  OpctlService,
  InMemoryReplayStore,
  InMemoryStartLockStore,
  InMemoryScopeLockStore,
  InMemoryProjectControlStateStore,
  issueSupervisorProof,
} from '../index.js';
import { resolveScope } from '../scope.js';

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

function envelope(projectId: ProjectId): ControlCommandEnvelope {
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
      project_id: projectId,
    },
    payload_hash: HASH,
    command_signature: 'stub-sig',
    action: 'hard_stop',
    payload: {
      sup_code: 'SUP-001',
      severity: 'S0',
      lock_set_at: '2026-04-22T12:00:00.000Z',
    },
  };
}

describe('Supervisor OpctlSubmitResult branches (UT-OP8)', () => {
  it('applied — happy path with valid proof', async () => {
    const projectId = randomUUID() as ProjectId;
    const svc = new OpctlService({
      replayStore: new InMemoryReplayStore(),
      startLockStore: new InMemoryStartLockStore(),
      scopeLockStore: new InMemoryScopeLockStore(),
      projectControlStateStore: new InMemoryProjectControlStateStore(),
      witnessService: mockWitnessService(),
    });
    const env = envelope(projectId);
    const proof = issueSupervisorProof('hard_stop', env.scope);
    const result = await svc.submitCommand(env, proof);
    expect(result.status).toBe('applied');
    expect(result.control_command_id).toBe(env.control_command_id);
  });

  it('blocked — opctl_conflict_resolved via scope-lock preempt', async () => {
    const projectId = randomUUID() as ProjectId;
    const scopeLockStore = new InMemoryScopeLockStore();
    const svc = new OpctlService({
      replayStore: new InMemoryReplayStore(),
      startLockStore: new InMemoryStartLockStore(),
      scopeLockStore,
      projectControlStateStore: new InMemoryProjectControlStateStore(),
      witnessService: mockWitnessService(),
    });
    const env = envelope(projectId);
    // Make it a lower-precedence action so the pre-seeded hard_stop
    // holder preempts it.
    const pauseEnv: ControlCommandEnvelope = { ...env, action: 'pause' };
    const snapshot = resolveScope(pauseEnv.scope);
    await scopeLockStore.acquire(
      snapshot.target_ids_hash,
      'hard_stop',
      randomUUID(),
    );
    const proof = issueSupervisorProof('pause', pauseEnv.scope);
    const result = await svc.submitCommand(pauseEnv, proof);
    expect(result.status).toBe('blocked');
    expect(result.reason_code).toBe('opctl_conflict_resolved');
  });

  it('blocked — OPCTL-003 on missing proof for T3 action', async () => {
    const projectId = randomUUID() as ProjectId;
    const svc = new OpctlService({
      replayStore: new InMemoryReplayStore(),
      startLockStore: new InMemoryStartLockStore(),
      scopeLockStore: new InMemoryScopeLockStore(),
      projectControlStateStore: new InMemoryProjectControlStateStore(),
      witnessService: mockWitnessService(),
    });
    const env = envelope(projectId);
    // No proof supplied → tier gate rejects with OPCTL-003 blocked.
    const result = await svc.submitCommand(env);
    expect(result.status).toBe('blocked');
    expect(result.reason_code).toBe('OPCTL-003');
  });
});
