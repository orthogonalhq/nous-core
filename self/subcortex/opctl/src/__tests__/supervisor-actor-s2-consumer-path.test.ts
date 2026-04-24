/**
 * WR-162 SP 5 — UT-OP6 — supervisor-actor S2 consumer-path (SUPV-SP5-009 + N1).
 *
 * The S2 branch ships the lock-write boundary (opctl owns lock state)
 * while the EventBus emit is enforce(...)'s responsibility (the supervisor
 * module's witness/event layer). This test asserts the opctl side:
 *   - `stop_response` applies (no state-apply branch is required — the
 *     action is consumer-path only at opctl; state remains whatever it
 *     was before).
 *   - Supervisor lock is written post-apply.
 *
 * The "no supervisor:enforcement-action EventBus emit on the opctl side"
 * invariant is inherent — `OpctlService` has no EventBus dependency and
 * does not publish any supervisor channel. The paired UT-EN6 on the
 * supervisor side locks the V1 skip-in-consumer behavior.
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

describe('Supervisor-actor stop_response (S2) consumer-path (UT-OP6)', () => {
  it('stop_response applies → lock written; opctl does not emit any EventBus event (no bus dep)', async () => {
    const projectId = randomUUID() as ProjectId;
    const store = new InMemoryProjectControlStateStore();
    const svc = new OpctlService({
      replayStore: new InMemoryReplayStore(),
      startLockStore: new InMemoryStartLockStore(),
      scopeLockStore: new InMemoryScopeLockStore(),
      projectControlStateStore: store,
      witnessService: mockWitnessService(),
    });

    const now = new Date().toISOString();
    const later = new Date(Date.now() + 60000).toISOString();
    const env: ControlCommandEnvelope = {
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
      action: 'stop_response',
      payload: {
        sup_code: 'SUP-009',
        severity: 'S2',
        lock_set_at: '2026-04-22T12:00:00.000Z',
      },
    };
    const proof = issueSupervisorProof('stop_response', env.scope);
    const result = await svc.submitCommand(env, proof);
    expect(result.status).toBe('applied');

    const lock = await store.getSupervisorLock(projectId);
    expect(lock.locked).toBe(true);
    expect(lock.sup_code).toBe('SUP-009');
    expect(lock.severity).toBe('S2');
  });
});
