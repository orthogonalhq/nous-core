import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  OpctlService,
  InMemoryReplayStore,
  InMemoryStartLockStore,
  InMemoryScopeLockStore,
  InMemoryProjectControlStateStore,
} from '../index.js';
import type {
  ControlCommandEnvelope,
  ConfirmationProof,
  ProjectId,
  WitnessEvent,
  WitnessAuthorizationInput,
  WitnessCompletionInput,
} from '@nous/shared';
import { createHash } from 'node:crypto';

function mockWitnessService(): import('@nous/shared').IWitnessService {
  return {
    appendAuthorization: async (input: WitnessAuthorizationInput) =>
      ({ id: randomUUID() as import('@nous/shared').WitnessEventId, sequence: 1 } as WitnessEvent),
    appendCompletion: async () => ({} as WitnessEvent),
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
const NOW = new Date().toISOString();
const LATER = new Date(Date.now() + 60000).toISOString();
const PROJECT_ID = randomUUID() as ProjectId;

function createEnvelope(overrides: Partial<ControlCommandEnvelope> = {}): ControlCommandEnvelope {
  return {
    control_command_id: randomUUID() as import('@nous/shared').ControlCommandId,
    actor_type: 'principal',
    actor_id: randomUUID(),
    actor_session_id: randomUUID(),
    actor_seq: 1,
    nonce: randomUUID(),
    issued_at: NOW,
    expires_at: LATER,
    scope: { class: 'project_run_scope', kind: 'project_run', target_ids: [], project_id: PROJECT_ID },
    payload_hash: HASH,
    command_signature: 'stub-sig',
    action: 'retry', // T0 - no confirmation required
    ...overrides,
  };
}

describe('OpctlService', () => {
  it('submitCommand returns OpctlSubmitResult', async () => {
    const authEventId = randomUUID() as import('@nous/shared').WitnessEventId;
    const svc = new OpctlService({
      replayStore: new InMemoryReplayStore(),
      startLockStore: new InMemoryStartLockStore(),
      scopeLockStore: new InMemoryScopeLockStore(),
      witnessService: {
        ...mockWitnessService(),
        appendAuthorization: async () =>
          ({ id: authEventId, sequence: 1 } as WitnessEvent),
        appendCompletion: async () =>
          ({ id: randomUUID() as import('@nous/shared').WitnessEventId, sequence: 2 } as WitnessEvent),
      },
    });
    const envelope = createEnvelope();
    const result = await svc.submitCommand(envelope);
    expect(result.status).toBe('applied');
    expect(result.control_command_id).toBe(envelope.control_command_id);
  });

  it('requestConfirmationProof returns valid proof', async () => {
    const svc = new OpctlService({
      replayStore: new InMemoryReplayStore(),
      startLockStore: new InMemoryStartLockStore(),
      scopeLockStore: new InMemoryScopeLockStore(),
    });
    const proof = await svc.requestConfirmationProof({
      scope: { class: 'project_run_scope', kind: 'project_run', target_ids: [], project_id: PROJECT_ID },
      action: 'hard_stop',
      tier: 'T3',
    });
    expect(proof.proof_id).toBeDefined();
    expect(proof.action).toBe('hard_stop');
    expect(proof.tier).toBe('T3');
  });

  it('validateConfirmationProof rejects expired proof', async () => {
    const svc = new OpctlService({
      replayStore: new InMemoryReplayStore(),
      startLockStore: new InMemoryStartLockStore(),
      scopeLockStore: new InMemoryScopeLockStore(),
    });
    const envelope = createEnvelope({ action: 'hard_stop' });
    const proof: ConfirmationProof = {
      proof_id: randomUUID(),
      issued_at: new Date(Date.now() - 600000).toISOString(),
      expires_at: new Date(Date.now() - 300000).toISOString(),
      scope_hash: HASH,
      action: 'hard_stop',
      tier: 'T3',
      signature: 'sig',
    };
    const valid = await svc.validateConfirmationProof(proof, envelope);
    expect(valid).toBe(false);
  });

  it('resolveScope returns ScopeSnapshot with target_ids_hash', async () => {
    const svc = new OpctlService({
      replayStore: new InMemoryReplayStore(),
      startLockStore: new InMemoryStartLockStore(),
      scopeLockStore: new InMemoryScopeLockStore(),
    });
    const snapshot = await svc.resolveScope({
      class: 'project_run_scope',
      kind: 'project_run',
      target_ids: [],
      project_id: PROJECT_ID,
    });
    expect(snapshot.target_ids_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.target_count).toBeGreaterThanOrEqual(0);
  });

  it('hasStartLock and setStartLock behavior', async () => {
    const svc = new OpctlService({
      replayStore: new InMemoryReplayStore(),
      startLockStore: new InMemoryStartLockStore(),
      scopeLockStore: new InMemoryScopeLockStore(),
    });
    expect(await svc.hasStartLock(PROJECT_ID)).toBe(false);
    await svc.setStartLock(PROJECT_ID, true, 'principal');
    expect(await svc.hasStartLock(PROJECT_ID)).toBe(true);
    await svc.setStartLock(PROJECT_ID, false, 'principal');
    expect(await svc.hasStartLock(PROJECT_ID)).toBe(false);
  });

  it('resume command clears hard stop lock and moves project into resuming', async () => {
    const startLockStore = new InMemoryStartLockStore();
    const projectControlStateStore = new InMemoryProjectControlStateStore();
    const svc = new OpctlService({
      replayStore: new InMemoryReplayStore(),
      startLockStore,
      scopeLockStore: new InMemoryScopeLockStore(),
      projectControlStateStore,
      witnessService: mockWitnessService(),
    });

    const hardStopEnvelope = createEnvelope({ action: 'hard_stop' });
    const hardStopProof = await svc.requestConfirmationProof({
      scope: hardStopEnvelope.scope,
      action: 'hard_stop',
      tier: 'T3',
      reason: 'Hard stop for investigation',
    });
    const hardStopResult = await svc.submitCommand(hardStopEnvelope, hardStopProof);
    expect(hardStopResult.status).toBe('applied');
    expect(await svc.hasStartLock(PROJECT_ID)).toBe(true);
    expect(await svc.getProjectControlState(PROJECT_ID)).toBe('hard_stopped');

    const resumeEnvelope = createEnvelope({ action: 'resume', actor_seq: 2 });
    const resumeProof = await svc.requestConfirmationProof({
      scope: resumeEnvelope.scope,
      action: 'resume',
      tier: 'T3',
      reason: 'Resume after review',
    });
    const resumeResult = await svc.submitCommand(resumeEnvelope, resumeProof);
    expect(resumeResult.status).toBe('applied');
    expect(await svc.hasStartLock(PROJECT_ID)).toBe(false);
    expect(await svc.getProjectControlState(PROJECT_ID)).toBe('resuming');
  });
});
