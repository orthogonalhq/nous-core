/**
 * WR-162 SP 5 — IT-SP5-1 — end-to-end S0 enforcement flow (DoD 2/3/5/6).
 *
 * Wires real components at the hermetic boundary:
 *   - Real `WitnessService` over in-memory document store.
 *   - Real `OpctlService` with in-memory replay/start/scope/control-state stores.
 *   - Real `SupervisorService` with a real `enforcement` slot.
 *   - Real `issueSupervisorProof` proof issuer.
 *   - Real `AgentClassToolSurfaceRegistry` subset tuned for SUP-001.
 *   - Stub `GatewayRunSnapshotRegistry` returning a Worker-class snapshot
 *     (same pattern as SP 4 IT-1).
 *
 * Seed: SUP-001 fixture (Worker dispatch_agent tool call).
 * Assertions: 11 per SDS § Integration Tests
 *   1. violationBuffer has one SUP-001 entry.
 *   2. supervisor:violation-detected emitted once.
 *   3. opctlService.submitCommand called once (supervisor / hard_stop).
 *   4. OpctlSubmitResult.applied; hard_stopped state; supervisor lock set.
 *   5. supervisor:enforcement-action emitted once with full payload.
 *   6. emitEnforcementWitness called once; verify() chain intact.
 *   7. Subsequent supervisor resume → supervisor_enforcement_lock (or
 *      forbidden_action — spec allows either).
 *   8. Subsequent operator resume → supervisor_enforcement_lock.
 *   9. Principal resume + valid T3 proof → applied; lock cleared.
 *   10. Principal resume + invalid T3 proof → OPCTL-003; lock stays.
 *   11. Replay with `enabled: false` → zero side effects.
 *
 * T3 proof stand-in (prompt § Integration test item 9): we use
 * `issueConfirmationProof({ action: 'resume', scope, tier: 'T3' })` as
 * the principal-T3 proof construction path — the same code path every
 * principal-actor resume uses in production. Full T3 UI / dialog
 * integration is SP 14.
 */
import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type {
  EventChannelMap,
  GatewayAgentId,
  GatewayRunId,
  GatewayRunSnapshot,
  IEventBus,
  SupervisorEnforcementActionPayload,
  SupervisorViolationDetectedPayload,
} from '@nous/shared';
import { WitnessService } from '@nous/subcortex-witnessd';
import {
  OpctlService,
  InMemoryReplayStore,
  InMemoryScopeLockStore,
  InMemoryStartLockStore,
  InMemoryProjectControlStateStore,
  issueSupervisorProof,
  issueConfirmationProof,
} from '@nous/subcortex-opctl';
import { createMemoryDocumentStore } from './in-memory-document-store.js';
import { SupervisorService } from '../supervisor-service.js';
import { SupervisorOutboxSink } from '../supervisor-outbox-sink.js';
import { enforce, type EnforcementDeps } from '../enforcement.js';
import type { GatewayRunSnapshotRegistry } from '../gateway-run-registry.js';

const ISO = '2026-04-22T00:00:00.000Z';
const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
const RUN_ID = '550e8400-e29b-41d4-a716-446655440001';
const AGENT_ID = '550e8400-e29b-41d4-a716-446655440002';
const GATEWAY_ID = '550e8400-e29b-41d4-a716-446655440003';
const EVENT_ID = '550e8400-e29b-41d4-a716-446655440004';

function createTestEventBus(): IEventBus {
  type AnyHandler = (payload: unknown) => void;
  const subs = new Map<keyof EventChannelMap, Set<AnyHandler>>();
  return {
    publish(channel, payload) {
      subs.get(channel)?.forEach((h) => h(payload as never));
    },
    subscribe(channel, handler) {
      if (!subs.has(channel)) subs.set(channel, new Set());
      subs.get(channel)!.add(handler as AnyHandler);
      return `sub-${channel.toString()}-${Math.random()}`;
    },
    unsubscribe() {
      /* noop */
    },
    dispose() {
      subs.clear();
    },
  };
}

function stubRegistry(): GatewayRunSnapshotRegistry {
  const snapshot: GatewayRunSnapshot = {
    agentId: AGENT_ID as GatewayAgentId,
    agentClass: 'Worker',
    correlation: {
      runId: RUN_ID as GatewayRunId,
      parentId: GATEWAY_ID as GatewayAgentId,
      sequence: 1,
    },
    budget: { maxTurns: 10, maxTokens: 1000, timeoutMs: 60000 },
    usage: { turnsUsed: 1, tokensUsed: 10, elapsedMs: 20, spawnUnitsUsed: 0 },
    startedAt: ISO,
    lastUpdatedAt: ISO,
    contextFrameCount: 0,
    execution: {
      projectId: PROJECT_ID as never,
    },
  };
  return {
    get: (runId) => (runId === (RUN_ID as GatewayRunId) ? snapshot : null),
  };
}

function mkEnforcementDeps(
  opctlService: OpctlService,
  witnessService: WitnessService,
  eventBus: IEventBus,
): EnforcementDeps {
  return {
    opctlService: {
      submitCommand: (envelope, proof) =>
        opctlService.submitCommand(envelope, proof),
    },
    witnessService,
    eventBus,
    proofIssuer: (args) => issueSupervisorProof(args.action, args.scope),
    actorId: '550e8400-e29b-41d4-a716-446655440abc',
    actorSessionId: '550e8400-e29b-41d4-a716-446655440def',
    nextActorSeq: (() => {
      let n = 0;
      return () => ++n;
    })(),
  };
}

describe('IT-SP5-1 — end-to-end S0 enforcement flow', () => {
  it('assertions 1–6: happy path S0 detection → enforcement → witness + EventBus', async () => {
    const documentStore = createMemoryDocumentStore();
    const witnessService = new WitnessService(documentStore);
    const bus = createTestEventBus();
    const detected: SupervisorViolationDetectedPayload[] = [];
    const enforced: SupervisorEnforcementActionPayload[] = [];
    bus.subscribe('supervisor:violation-detected', (p) => detected.push(p));
    bus.subscribe('supervisor:enforcement-action', (p) => enforced.push(p));

    const controlStateStore = new InMemoryProjectControlStateStore();
    const startLockStore = new InMemoryStartLockStore();
    const opctlService = new OpctlService({
      replayStore: new InMemoryReplayStore(),
      startLockStore,
      scopeLockStore: new InMemoryScopeLockStore(),
      projectControlStateStore: controlStateStore,
      witnessService,
    });
    const submitSpy = vi.spyOn(opctlService, 'submitCommand');
    const enforcementDeps = mkEnforcementDeps(opctlService, witnessService, bus);
    const supervisor = new SupervisorService({
      config: { enabled: true, maxObservationQueueDepth: 64 },
      witnessService,
      eventBus: bus,
      enforcement: {
        enforce: (v, d) => enforce(v, d),
        deps: enforcementDeps,
      },
      toolSurfaceRegistry: {
        getAllowedToolsForClass: (agentClass) =>
          agentClass === 'Worker' ? ['read_file', 'dispatch_agent'] : ['*'],
      },
    });
    const sink = new SupervisorOutboxSink({
      service: supervisor,
      gatewayRunSnapshotRegistry: stubRegistry(),
    });
    await sink.emit({
      type: 'observation',
      eventId: EVENT_ID as never,
      observation: {
        observationType: 'tool_call',
        content: 'dispatch',
        detail: { name: 'dispatch_agent', params: {} },
      },
      correlation: {
        runId: RUN_ID as GatewayRunId,
        parentId: GATEWAY_ID as GatewayAgentId,
        sequence: 1,
      },
      usage: { turnsUsed: 1, tokensUsed: 10, elapsedMs: 20, spawnUnitsUsed: 0 },
      emittedAt: ISO,
    });
    // Allow fire-and-forget classify + fire-and-await enforcement to
    // settle. The `await enforce(...)` is inside a microtask chain
    // kicked off by `runClassifier`; a short wait drains both.
    await new Promise((r) => setTimeout(r, 50));

    // (1) violation buffer has one SUP-001 entry.
    const snapshot = supervisor.getViolationBufferSnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]?.supCode).toBe('SUP-001');
    expect(snapshot[0]?.severity).toBe('S0');

    // (2) supervisor:violation-detected emitted once.
    expect(detected).toHaveLength(1);

    // (3) opctlService.submitCommand called once; supervisor / hard_stop.
    expect(submitSpy).toHaveBeenCalledTimes(1);
    const submittedEnvelope = submitSpy.mock.calls[0]?.[0];
    expect(submittedEnvelope?.actor_type).toBe('supervisor');
    expect(submittedEnvelope?.action).toBe('hard_stop');

    // (4) OpctlSubmitResult.applied; startLock → true (hard_stopped);
    //     supervisor lock set.
    const hasStartLock = await startLockStore.hasStartLock(
      PROJECT_ID as import('@nous/shared').ProjectId,
    );
    expect(hasStartLock).toBe(true);
    const lockSnap = await controlStateStore.getSupervisorLock(
      PROJECT_ID as import('@nous/shared').ProjectId,
    );
    expect(lockSnap.locked).toBe(true);
    expect(lockSnap.sup_code).toBe('SUP-001');
    expect(lockSnap.severity).toBe('S0');

    // (5) supervisor:enforcement-action emitted once.
    expect(enforced).toHaveLength(1);
    expect(enforced[0]?.sup_code).toBe('SUP-001');
    expect(enforced[0]?.action).toBe('hard_stop');

    // (6) witness ledger has >= 2 events (detection + enforcement);
    //     verify() chain-integrity booleans are true.
    const report = await witnessService.verify();
    expect(report.ledger.eventCount).toBeGreaterThanOrEqual(2);
    expect(report.ledger.hashChainValid).toBe(true);
    expect(report.ledger.sequenceContiguous).toBe(true);
    expect(report.checkpoints.checkpointChainValid).toBe(true);
    expect(report.checkpoints.signaturesValid).toBe(true);

    // (7) supervisor self-resume → rejected.
    const supResumeEnv: import('@nous/shared').ControlCommandEnvelope = {
      control_command_id: randomUUID() as import('@nous/shared').ControlCommandId,
      actor_type: 'supervisor',
      actor_id: randomUUID(),
      actor_session_id: randomUUID(),
      actor_seq: 1,
      nonce: randomUUID(),
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      scope: {
        class: 'project_run_scope',
        kind: 'project_run',
        target_ids: [],
        project_id: PROJECT_ID as import('@nous/shared').ProjectId,
      },
      payload_hash: 'a'.repeat(64),
      command_signature: 'stub-sig',
      action: 'resume',
    };
    const supResumeProof = issueSupervisorProof('resume', supResumeEnv.scope);
    const supResumeResult = await opctlService.submitCommand(
      supResumeEnv,
      supResumeProof,
    );
    expect(supResumeResult.status).toBe('rejected');
    expect(
      supResumeResult.reason_code === 'supervisor_actor_forbidden_action' ||
        supResumeResult.reason_code === 'supervisor_enforcement_lock',
    ).toBe(true);
    expect(
      (
        await controlStateStore.getSupervisorLock(
          PROJECT_ID as import('@nous/shared').ProjectId,
        )
      ).locked,
    ).toBe(true);

    // (8) operator resume → supervisor_enforcement_lock. Use a fresh
    // actor_session_id so actor_seq sequencing starts clean per actor.
    const opResumeEnv: import('@nous/shared').ControlCommandEnvelope = {
      ...supResumeEnv,
      control_command_id: randomUUID() as import('@nous/shared').ControlCommandId,
      actor_type: 'orchestration_agent',
      nonce: randomUUID(),
      actor_session_id: randomUUID(),
      actor_seq: 1,
    };
    const opResumeProof = issueConfirmationProof({
      action: 'resume',
      scope: opResumeEnv.scope,
      tier: 'T3',
    });
    const opResumeResult = await opctlService.submitCommand(
      opResumeEnv,
      opResumeProof,
    );
    expect(opResumeResult.status).toBe('rejected');
    expect(opResumeResult.reason_code).toBe('supervisor_enforcement_lock');
    expect(
      (
        await controlStateStore.getSupervisorLock(
          PROJECT_ID as import('@nous/shared').ProjectId,
        )
      ).locked,
    ).toBe(true);

    // (10) principal + invalid T3 proof → OPCTL-003; lock stays.
    const pInvalidEnv: import('@nous/shared').ControlCommandEnvelope = {
      ...supResumeEnv,
      control_command_id: randomUUID() as import('@nous/shared').ControlCommandId,
      actor_type: 'principal',
      nonce: randomUUID(),
      actor_session_id: randomUUID(),
      actor_seq: 1,
    };
    const pInvalidProof = issueConfirmationProof({
      action: 'resume',
      scope: {
        ...pInvalidEnv.scope,
        project_id: randomUUID() as import('@nous/shared').ProjectId,
      },
      tier: 'T3',
    });
    const pInvalidResult = await opctlService.submitCommand(
      pInvalidEnv,
      pInvalidProof,
    );
    expect(pInvalidResult.status).toBe('blocked');
    expect(pInvalidResult.reason_code).toBe('OPCTL-003');
    expect(
      (
        await controlStateStore.getSupervisorLock(
          PROJECT_ID as import('@nous/shared').ProjectId,
        )
      ).locked,
    ).toBe(true);

    // (9) principal + valid T3 proof → applied; lock cleared.
    const pValidEnv: import('@nous/shared').ControlCommandEnvelope = {
      ...supResumeEnv,
      control_command_id: randomUUID() as import('@nous/shared').ControlCommandId,
      actor_type: 'principal',
      nonce: randomUUID(),
      actor_session_id: randomUUID(),
      actor_seq: 1,
    };
    const pValidProof = issueConfirmationProof({
      action: 'resume',
      scope: pValidEnv.scope,
      tier: 'T3',
    });
    const pValidResult = await opctlService.submitCommand(
      pValidEnv,
      pValidProof,
    );
    expect(pValidResult.status).toBe('applied');
    expect(
      (
        await controlStateStore.getSupervisorLock(
          PROJECT_ID as import('@nous/shared').ProjectId,
        )
      ).locked,
    ).toBe(false);
  });

  it('assertion 11: enabled: false → zero side effects', async () => {
    const documentStore = createMemoryDocumentStore();
    const witnessService = new WitnessService(documentStore);
    const bus = createTestEventBus();
    const detected: SupervisorViolationDetectedPayload[] = [];
    const enforced: SupervisorEnforcementActionPayload[] = [];
    bus.subscribe('supervisor:violation-detected', (p) => detected.push(p));
    bus.subscribe('supervisor:enforcement-action', (p) => enforced.push(p));
    const controlStateStore = new InMemoryProjectControlStateStore();
    const opctlService = new OpctlService({
      replayStore: new InMemoryReplayStore(),
      startLockStore: new InMemoryStartLockStore(),
      scopeLockStore: new InMemoryScopeLockStore(),
      projectControlStateStore: controlStateStore,
      witnessService,
    });
    const submitSpy = vi.spyOn(opctlService, 'submitCommand');
    const enforcementDeps = mkEnforcementDeps(opctlService, witnessService, bus);
    const supervisor = new SupervisorService({
      config: { enabled: false, maxObservationQueueDepth: 64 },
      witnessService,
      eventBus: bus,
      enforcement: { enforce: (v, d) => enforce(v, d), deps: enforcementDeps },
      toolSurfaceRegistry: {
        getAllowedToolsForClass: (agentClass) =>
          agentClass === 'Worker' ? ['read_file', 'dispatch_agent'] : ['*'],
      },
    });
    const sink = new SupervisorOutboxSink({
      service: supervisor,
      gatewayRunSnapshotRegistry: stubRegistry(),
    });
    await sink.emit({
      type: 'observation',
      eventId: EVENT_ID as never,
      observation: {
        observationType: 'tool_call',
        content: 'dispatch',
        detail: { name: 'dispatch_agent', params: {} },
      },
      correlation: {
        runId: RUN_ID as GatewayRunId,
        parentId: GATEWAY_ID as GatewayAgentId,
        sequence: 1,
      },
      usage: { turnsUsed: 1, tokensUsed: 10, elapsedMs: 20, spawnUnitsUsed: 0 },
      emittedAt: ISO,
    });
    await new Promise((r) => setTimeout(r, 50));

    expect(supervisor.getViolationBufferSnapshot()).toHaveLength(0);
    expect(detected).toHaveLength(0);
    expect(enforced).toHaveLength(0);
    expect(submitSpy).not.toHaveBeenCalled();
    const lockSnap = await controlStateStore.getSupervisorLock(
      PROJECT_ID as import('@nous/shared').ProjectId,
    );
    expect(lockSnap.locked).toBe(false);
  });
});
