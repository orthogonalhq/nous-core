/**
 * WR-162 SP 5 — UT-OP5 — supervisor-actor lock-write branch (SUPV-SP5-009).
 *
 * Asserts that when an allowlisted supervisor-actor command applies
 * (`hard_stop`, `pause`), the supervisor enforcement lock is written
 * atomically inside the state-apply try/block with the provenance the
 * enforcement layer supplied via `envelope.payload`.
 */
import { describe, it, expect } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import type {
  ControlAction,
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

function supervisorEnvelope(
  action: ControlAction,
  projectId: ProjectId,
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
      project_id: projectId,
    },
    payload_hash: HASH,
    command_signature: 'stub-sig',
    action,
    payload: {
      sup_code: action === 'hard_stop' ? 'SUP-001' : 'SUP-003',
      severity: action === 'hard_stop' ? 'S0' : 'S1',
      lock_set_at: '2026-04-22T12:00:00.000Z',
    },
  };
}

function makeService(): {
  svc: OpctlService;
  store: InMemoryProjectControlStateStore;
} {
  const store = new InMemoryProjectControlStateStore();
  const svc = new OpctlService({
    replayStore: new InMemoryReplayStore(),
    startLockStore: new InMemoryStartLockStore(),
    scopeLockStore: new InMemoryScopeLockStore(),
    projectControlStateStore: store,
    witnessService: mockWitnessService(),
  });
  return { svc, store };
}

describe('Supervisor-actor lock write (UT-OP5)', () => {
  it('supervisor hard_stop applies → supervisor lock written with provenance', async () => {
    const projectId = randomUUID() as ProjectId;
    const { svc, store } = makeService();
    const env = supervisorEnvelope('hard_stop', projectId);
    const proof = issueSupervisorProof('hard_stop', env.scope);
    const result = await svc.submitCommand(env, proof);
    expect(result.status).toBe('applied');

    const lock = await store.getSupervisorLock(projectId);
    expect(lock.locked).toBe(true);
    expect(lock.sup_code).toBe('SUP-001');
    expect(lock.severity).toBe('S0');
    expect(lock.set_at).toBe('2026-04-22T12:00:00.000Z');
  });

  it('supervisor pause applies → supervisor lock written with provenance', async () => {
    const projectId = randomUUID() as ProjectId;
    const { svc, store } = makeService();
    const env = supervisorEnvelope('pause', projectId);
    const proof = issueSupervisorProof('pause', env.scope);
    const result = await svc.submitCommand(env, proof);
    expect(result.status).toBe('applied');

    const lock = await store.getSupervisorLock(projectId);
    expect(lock.locked).toBe(true);
    expect(lock.sup_code).toBe('SUP-003');
    expect(lock.severity).toBe('S1');
  });
});
