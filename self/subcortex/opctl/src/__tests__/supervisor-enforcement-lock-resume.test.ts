/**
 * WR-162 SP 5 — UT-OP4 — ESC-001 resume-lock matrix (SUPV-SP5-010).
 *
 * Four-row matrix per Goals SC 4 + SDS § Failure Modes:
 *   - Supervisor self-resume on locked scope → rejected by SUPV-SP5-011
 *     allowlist (supervisor_actor_forbidden_action). Lock stays set.
 *   - Operator-actor resume on locked scope → rejected by SUPV-SP5-010
 *     resume-lock gate (supervisor_enforcement_lock). Lock stays set.
 *   - Principal resume with invalid T3 proof → rejected by the existing
 *     OPCTL-003 gate (precedes the resume-lock gate). Lock stays set.
 *   - Principal resume with valid T3 proof → applied; state transitions
 *     to 'resuming'; supervisor lock cleared atomically.
 */
import { describe, it, expect } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import type {
  ControlActorType,
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
  issueConfirmationProof,
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

function envelope(
  params: {
    actor: ControlActorType;
    action: ControlAction;
    projectId: ProjectId;
    payload?: Record<string, unknown>;
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
    payload: params.payload ?? { sup_code: 'SUP-001', severity: 'S0' },
  };
}

function makeService(store?: InMemoryProjectControlStateStore): {
  svc: OpctlService;
  store: InMemoryProjectControlStateStore;
} {
  const s = store ?? new InMemoryProjectControlStateStore();
  const svc = new OpctlService({
    replayStore: new InMemoryReplayStore(),
    startLockStore: new InMemoryStartLockStore(),
    scopeLockStore: new InMemoryScopeLockStore(),
    projectControlStateStore: s,
    witnessService: mockWitnessService(),
  });
  return { svc, store: s };
}

async function seedLockViaSupervisorHardStop(
  svc: OpctlService,
  projectId: ProjectId,
): Promise<void> {
  const env = envelope({
    actor: 'supervisor',
    action: 'hard_stop',
    projectId,
    payload: {
      sup_code: 'SUP-001',
      severity: 'S0',
      lock_set_at: '2026-04-22T12:00:00.000Z',
    },
  });
  const proof = issueSupervisorProof('hard_stop', env.scope);
  const result = await svc.submitCommand(env, proof);
  if (result.status !== 'applied') {
    throw new Error(`seed failed: ${result.status} ${result.reason_code}`);
  }
}

describe('ESC-001 resume-lock matrix (UT-OP4)', () => {
  it('supervisor self-resume on locked scope → rejected (forbidden_action); lock stays set', async () => {
    const projectId = randomUUID() as ProjectId;
    const { svc, store } = makeService();
    await seedLockViaSupervisorHardStop(svc, projectId);

    const env = envelope({ actor: 'supervisor', action: 'resume', projectId });
    const proof = issueSupervisorProof('resume', env.scope);
    const result = await svc.submitCommand(env, proof);
    expect(result.status).toBe('rejected');
    // Supervisor self-resume is forbidden by the allowlist gate; it
    // never reaches the resume-lock gate. Either reason_code is a
    // pass per the ESC-001 matrix — the spec pins both. We assert
    // the allowlist path here to document the ordering.
    expect(result.reason_code).toBe('supervisor_actor_forbidden_action');

    const lock = await store.getSupervisorLock(projectId);
    expect(lock.locked).toBe(true);
  });

  it('operator-actor resume on locked scope → rejected (supervisor_enforcement_lock); lock stays set', async () => {
    const projectId = randomUUID() as ProjectId;
    const { svc, store } = makeService();
    await seedLockViaSupervisorHardStop(svc, projectId);

    const env = envelope({
      actor: 'orchestration_agent',
      action: 'resume',
      projectId,
    });
    const proof = issueConfirmationProof({
      action: 'resume',
      scope: env.scope,
      tier: 'T3',
    });
    const result = await svc.submitCommand(env, proof);
    expect(result.status).toBe('rejected');
    expect(result.reason_code).toBe('supervisor_enforcement_lock');

    const lock = await store.getSupervisorLock(projectId);
    expect(lock.locked).toBe(true);
  });

  it('principal resume + invalid T3 proof → rejected (OPCTL-003); lock stays set', async () => {
    const projectId = randomUUID() as ProjectId;
    const otherProjectId = randomUUID() as ProjectId;
    const { svc, store } = makeService();
    await seedLockViaSupervisorHardStop(svc, projectId);

    const env = envelope({ actor: 'principal', action: 'resume', projectId });
    // Scope-mismatched proof: binds to a DIFFERENT project_id, so
    // validateConfirmationProof fails with OPCTL-003 BEFORE the
    // resume-lock gate fires.
    const badProof = issueConfirmationProof({
      action: 'resume',
      scope: {
        class: 'project_run_scope',
        kind: 'project_run',
        target_ids: [],
        project_id: otherProjectId,
      },
      tier: 'T3',
    });
    const result = await svc.submitCommand(env, badProof);
    expect(result.status).toBe('blocked');
    expect(result.reason_code).toBe('OPCTL-003');

    const lock = await store.getSupervisorLock(projectId);
    expect(lock.locked).toBe(true);
  });

  it('principal resume + valid T3 proof → applied; state → resuming; lock cleared atomically', async () => {
    const projectId = randomUUID() as ProjectId;
    const { svc, store } = makeService();
    await seedLockViaSupervisorHardStop(svc, projectId);

    const env = envelope({ actor: 'principal', action: 'resume', projectId });
    const proof = issueConfirmationProof({
      action: 'resume',
      scope: env.scope,
      tier: 'T3',
    });
    const result = await svc.submitCommand(env, proof);
    expect(result.status).toBe('applied');
    expect(await store.get(projectId)).toBe('resuming');

    const lock = await store.getSupervisorLock(projectId);
    expect(lock.locked).toBe(false);
  });
});
