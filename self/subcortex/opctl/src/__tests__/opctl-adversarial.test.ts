import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  OpctlService,
  InMemoryReplayStore,
  InMemoryStartLockStore,
  InMemoryScopeLockStore,
} from '../index.js';
import type {
  ControlCommandEnvelope,
  ProjectId,
  WitnessEvent,
  WitnessAuthorizationInput,
} from '@nous/shared';
import { createHash } from 'node:crypto';

function mockWitnessService(): import('@nous/shared').IWitnessService {
  return {
    appendAuthorization: async () =>
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

describe('OpctlService adversarial', () => {
  it('replayed command ID is blocked', async () => {
    const replayStore = new InMemoryReplayStore();
    const svc = new OpctlService({
      replayStore,
      startLockStore: new InMemoryStartLockStore(),
      scopeLockStore: new InMemoryScopeLockStore(),
      witnessService: mockWitnessService(),
    });
    const envelope = createEnvelope();
    const first = await svc.submitCommand(envelope);
    expect(first.status).toBe('applied');

    const second = await svc.submitCommand(envelope);
    expect(second.status).toBe('rejected');
    expect(second.reason_code).toBe('OPCTL-002');
  });

  it('reused nonce is blocked', async () => {
    const replayStore = new InMemoryReplayStore();
    const svc = new OpctlService({
      replayStore,
      startLockStore: new InMemoryStartLockStore(),
      scopeLockStore: new InMemoryScopeLockStore(),
      witnessService: mockWitnessService(),
    });
    const nonce = randomUUID();
    const sessionId = randomUUID();
    const env1 = createEnvelope({ nonce, actor_session_id: sessionId, actor_seq: 1 });
    const env2 = createEnvelope({ nonce, actor_session_id: sessionId, actor_seq: 2 });

    const first = await svc.submitCommand(env1);
    expect(first.status).toBe('applied');

    const second = await svc.submitCommand(env2);
    expect(second.status).toBe('rejected');
  });

  it('out-of-order actor_seq is blocked', async () => {
    const replayStore = new InMemoryReplayStore();
    const svc = new OpctlService({
      replayStore,
      startLockStore: new InMemoryStartLockStore(),
      scopeLockStore: new InMemoryScopeLockStore(),
      witnessService: mockWitnessService(),
    });
    const sessionId = randomUUID();
    const env1 = createEnvelope({ actor_session_id: sessionId, actor_seq: 2 });
    const env2 = createEnvelope({ actor_session_id: sessionId, actor_seq: 1 });

    const first = await svc.submitCommand(env1);
    expect(first.status).toBe('applied');

    const second = await svc.submitCommand(env2);
    expect(second.status).toBe('rejected');
  });

  it('expired command is blocked', async () => {
    const svc = new OpctlService({
      replayStore: new InMemoryReplayStore(),
      startLockStore: new InMemoryStartLockStore(),
      scopeLockStore: new InMemoryScopeLockStore(),
    });
    const past = new Date(Date.now() - 60000).toISOString();
    const envelope = createEnvelope({ issued_at: past, expires_at: past });
    const result = await svc.submitCommand(envelope);
    expect(result.status).toBe('rejected');
    expect(result.reason_code).toBe('OPCTL-002');
  });

  it('T2 command without confirmation_proof is blocked', async () => {
    const svc = new OpctlService({
      replayStore: new InMemoryReplayStore(),
      startLockStore: new InMemoryStartLockStore(),
      scopeLockStore: new InMemoryScopeLockStore(),
    });
    const envelope = createEnvelope({ action: 'cancel' });
    const result = await svc.submitCommand(envelope);
    expect(result.status).toBe('blocked');
    expect(result.reason_code).toBe('OPCTL-003');
  });

  it('conflicting concurrent command blocked with opctl_conflict_resolved, deterministic precedence', async () => {
    const baseStore = new InMemoryScopeLockStore();
    let resolveAcquired: () => void;
    const acquiredPromise = new Promise<void>((r) => {
      resolveAcquired = r;
    });
    const scopeLockStore: import('../index.js').ScopeLockStore = {
      acquire: async (scopeKey, action, commandId) => {
        const result = await baseStore.acquire(scopeKey, action, commandId);
        if (result.acquired && action === 'revert') resolveAcquired();
        return result;
      },
      release: (scopeKey) => baseStore.release(scopeKey),
    };
    const delayMs = 50;
    const svc = new OpctlService({
      replayStore: new InMemoryReplayStore(),
      startLockStore: new InMemoryStartLockStore(),
      scopeLockStore,
      witnessService: {
        ...mockWitnessService(),
        appendAuthorization: async (input) => {
          await new Promise((r) => setTimeout(r, delayMs));
          return mockWitnessService().appendAuthorization(input);
        },
        appendCompletion: async (input) =>
          mockWitnessService().appendCompletion(input),
      },
    });
    const envelopeRevert = createEnvelope({ action: 'revert' }); // higher precedence (T0)
    const envelopeRetry = createEnvelope({ action: 'retry' }); // lower precedence (T0)

    const pRevert = svc.submitCommand(envelopeRevert);
    await acquiredPromise;
    const pRetry = svc.submitCommand(envelopeRetry);
    const [resultRevert, resultRetry] = await Promise.all([pRevert, pRetry]);
    expect(resultRevert.status).toBe('applied');
    expect(resultRetry.status).toBe('blocked');
    expect(resultRetry.reason_code).toBe('opctl_conflict_resolved');
  });

  it('0 successful replayed commands in adversarial suite', async () => {
    const replayStore = new InMemoryReplayStore();
    const svc = new OpctlService({
      replayStore,
      startLockStore: new InMemoryStartLockStore(),
      scopeLockStore: new InMemoryScopeLockStore(),
      witnessService: mockWitnessService(),
    });
    const envelope = createEnvelope();
    await svc.submitCommand(envelope);
    const replayAttempt = await svc.submitCommand(envelope);
    expect(replayAttempt.status).not.toBe('applied');
  });
});
