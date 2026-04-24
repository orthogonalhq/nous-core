/**
 * WR-162 SP 5 — UT-OP7 — supervisor arbitration (SUPV-SP5-012).
 *
 * The `PRECEDENCE_ORDER` invariant is preserved verbatim: supervisor
 * commands use the same action-level precedence as every other actor.
 *   - Supervisor `pause` colliding with an in-flight operator `hard_stop`
 *     → `blocked + opctl_conflict_resolved + holderAction: 'hard_stop'`
 *     (pause has lower precedence rank than hard_stop).
 *   - Supervisor `pause` first, then operator `hard_stop` after the
 *     supervisor pause releases → operator applies (the supervisor has
 *     already released the scope lock; no precedence race).
 *
 * The in-flight collision is simulated by seeding the ScopeLockStore
 * with a pre-existing holder (the in-flight command), then submitting
 * the supervisor command against that held scope. This is the same
 * pattern the existing OPCTL-005 arbitration tests use.
 */
import { describe, it, expect } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import type {
  ControlAction,
  ControlActorType,
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
  issueConfirmationProof,
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

function envelope(
  params: {
    actor: ControlActorType;
    action: ControlAction;
    projectId: ProjectId;
  },
): ControlCommandEnvelope {
  const now = new Date().toISOString();
  const later = new Date(Date.now() + 60000).toISOString();
  return {
    control_command_id: randomUUID() as import('@nous/shared').ControlCommandId,
    actor_type: params.actor,
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
      project_id: params.projectId,
    },
    payload_hash: HASH,
    command_signature: 'stub-sig',
    action: params.action,
    payload: { sup_code: 'SUP-003', severity: 'S1' },
  };
}

describe('Supervisor arbitration (UT-OP7)', () => {
  it('supervisor pause during in-flight operator hard_stop → blocked + opctl_conflict_resolved', async () => {
    const projectId = randomUUID() as ProjectId;
    const scopeLockStore = new InMemoryScopeLockStore();
    const svc = new OpctlService({
      replayStore: new InMemoryReplayStore(),
      startLockStore: new InMemoryStartLockStore(),
      scopeLockStore,
      projectControlStateStore: new InMemoryProjectControlStateStore(),
      witnessService: mockWitnessService(),
    });

    // Pre-seed the scope-lock with an in-flight hard_stop holder.
    const env = envelope({
      actor: 'supervisor',
      action: 'pause',
      projectId,
    });
    const snapshot = resolveScope(env.scope);
    const scopeKey = snapshot.target_ids_hash;
    const acquireHolder = await scopeLockStore.acquire(
      scopeKey,
      'hard_stop',
      randomUUID(),
    );
    expect(acquireHolder.acquired).toBe(true);

    const proof = issueSupervisorProof('pause', env.scope);
    const result = await svc.submitCommand(env, proof);
    expect(result.status).toBe('blocked');
    expect(result.reason_code).toBe('opctl_conflict_resolved');
  });

  it('supervisor pause first (releases lock) → operator hard_stop applies', async () => {
    const projectId = randomUUID() as ProjectId;
    const svc = new OpctlService({
      replayStore: new InMemoryReplayStore(),
      startLockStore: new InMemoryStartLockStore(),
      scopeLockStore: new InMemoryScopeLockStore(),
      projectControlStateStore: new InMemoryProjectControlStateStore(),
      witnessService: mockWitnessService(),
    });

    const pauseEnv = envelope({ actor: 'supervisor', action: 'pause', projectId });
    const pauseProof = issueSupervisorProof('pause', pauseEnv.scope);
    const pauseResult = await svc.submitCommand(pauseEnv, pauseProof);
    expect(pauseResult.status).toBe('applied');

    const hardStopEnv = envelope({
      actor: 'orchestration_agent',
      action: 'hard_stop',
      projectId,
    });
    const hardStopProof = issueConfirmationProof({
      action: 'hard_stop',
      scope: hardStopEnv.scope,
      tier: 'T3',
    });
    const hardStopResult = await svc.submitCommand(hardStopEnv, hardStopProof);
    expect(hardStopResult.status).toBe('applied');
  });
});
