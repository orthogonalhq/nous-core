/**
 * WR-162 SP 5 — UT-EN1..UT-EN10 — enforcement module contract tests.
 *
 * Covers the 8-step `enforce(...)` body per SDS § Invariants:
 *   - UT-EN1 severity → action matrix (S0/S1/S2/S3)
 *   - UT-EN2 S3 short-circuit (SUPV-SP5-003)
 *   - UT-EN3 applied branch
 *   - UT-EN4 conflict_resolved branch
 *   - UT-EN5 rejected branch
 *   - UT-EN6 S2 consumer-path EventBus skip (review N1)
 *   - UT-EN7 no-heuristic-bandaid (SUPV-SP5-013) — unknown status throws
 *   - UT-EN8 submitCommand throws → propagates; no witness; no EventBus
 *   - UT-EN9 emitEnforcementWitness throws → metric; result preserved
 *   - UT-EN10 eventBus.publish throws → metric; result preserved
 */
import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type {
  ControlAction,
  ConfirmationProof,
  ControlCommandEnvelope,
  ControlScope,
  IEventBus,
  IWitnessService,
  OpctlSubmitResult,
  SupervisorViolationRecord,
  WitnessEvent,
} from '@nous/shared';
import {
  enforce,
  EnforcementContractDefectError,
  type EnforcementDeps,
  type EnforcementOpctlService,
} from '../enforcement.js';

const ISO = '2026-04-22T00:00:00.000Z';
const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
const RUN_ID = '550e8400-e29b-41d4-a716-446655440001';
const AGENT_ID = '550e8400-e29b-41d4-a716-446655440002';

function mkViolation(
  overrides: Partial<SupervisorViolationRecord> = {},
): SupervisorViolationRecord {
  return {
    supCode: 'SUP-001',
    severity: 'S0',
    agentId: AGENT_ID,
    agentClass: 'Worker',
    runId: RUN_ID,
    projectId: PROJECT_ID,
    evidenceRefs: ['evt-1'],
    detectedAt: ISO,
    enforcement: null,
    ...overrides,
  };
}

function mkWitnessService(): IWitnessService {
  return {
    appendInvariant: vi.fn(async () =>
      ({ id: randomUUID() as import('@nous/shared').WitnessEventId, sequence: 1 } as WitnessEvent),
    ),
    appendAuthorization: vi.fn(),
    appendCompletion: vi.fn(),
    createCheckpoint: vi.fn(),
    rotateKeyEpoch: vi.fn(),
    verify: vi.fn(),
    getReport: vi.fn(),
    listReports: vi.fn(),
    getLatestCheckpoint: vi.fn(),
  } as unknown as IWitnessService;
}

function mkEventBus(): IEventBus {
  return {
    publish: vi.fn(),
    subscribe: vi.fn(() => 'sub-id'),
    unsubscribe: vi.fn(),
    dispose: vi.fn(),
  };
}

function mkOpctlService(
  result: OpctlSubmitResult,
): {
  svc: EnforcementOpctlService;
  submit: ReturnType<typeof vi.fn>;
} {
  const submit = vi.fn(async () => result);
  return {
    svc: { submitCommand: submit as unknown as EnforcementOpctlService['submitCommand'] },
    submit,
  };
}

function mkProofIssuer(): {
  issuer: EnforcementDeps['proofIssuer'];
  calls: Array<{ action: ControlAction; scope: ControlScope }>;
} {
  const calls: Array<{ action: ControlAction; scope: ControlScope }> = [];
  const issuer: EnforcementDeps['proofIssuer'] = (args) => {
    calls.push(args);
    return {
      proof_id: randomUUID(),
      issued_at: ISO,
      expires_at: '2026-04-22T00:05:00.000Z',
      scope_hash: 'a'.repeat(64),
      action: args.action,
      tier: 'T3',
      signature: 'stub-sig',
    } as ConfirmationProof;
  };
  return { issuer, calls };
}

function mkDeps(overrides: Partial<EnforcementDeps> = {}): {
  deps: EnforcementDeps;
  witnessService: IWitnessService;
  eventBus: IEventBus;
  metric: ReturnType<typeof vi.fn>;
} {
  const witnessService = overrides.witnessService ?? mkWitnessService();
  const eventBus = overrides.eventBus ?? mkEventBus();
  const metric = vi.fn();
  const { issuer } = mkProofIssuer();
  const deps: EnforcementDeps = {
    opctlService: overrides.opctlService ?? {
      submitCommand: vi.fn(async () => ({
        status: 'applied',
        control_command_id: randomUUID(),
      } as unknown as OpctlSubmitResult)),
    },
    witnessService,
    eventBus,
    proofIssuer: overrides.proofIssuer ?? issuer,
    metric: (overrides.metric as EnforcementDeps['metric']) ?? (metric as EnforcementDeps['metric']),
    now: () => new Date(ISO),
    actorId: 'supervisor-actor',
    actorSessionId: 'supervisor-session',
    nextActorSeq: (() => {
      let n = 0;
      return () => ++n;
    })(),
    ...overrides,
  };
  return { deps, witnessService, eventBus, metric };
}

describe('enforce — severity → action matrix (UT-EN1)', () => {
  it('S0 SUP-001 → opctl envelope carries action hard_stop', async () => {
    const { svc, submit } = mkOpctlService({
      status: 'applied',
      control_command_id: randomUUID(),
    } as unknown as OpctlSubmitResult);
    const { deps } = mkDeps({ opctlService: svc });
    await enforce(mkViolation({ supCode: 'SUP-001', severity: 'S0' }), deps);
    expect(submit).toHaveBeenCalledTimes(1);
    const envelope = submit.mock.calls[0]?.[0] as ControlCommandEnvelope;
    expect(envelope.action).toBe('hard_stop');
    expect(envelope.actor_type).toBe('supervisor');
  });

  it('S1 SUP-003 → opctl envelope carries action pause', async () => {
    const { svc, submit } = mkOpctlService({
      status: 'applied',
      control_command_id: randomUUID(),
    } as unknown as OpctlSubmitResult);
    const { deps } = mkDeps({ opctlService: svc });
    await enforce(mkViolation({ supCode: 'SUP-003', severity: 'S1' }), deps);
    const envelope = submit.mock.calls[0]?.[0] as ControlCommandEnvelope;
    expect(envelope.action).toBe('pause');
  });

  it('S2 synthetic → opctl envelope carries action stop_response', async () => {
    const { svc, submit } = mkOpctlService({
      status: 'applied',
      control_command_id: randomUUID(),
    } as unknown as OpctlSubmitResult);
    const { deps } = mkDeps({ opctlService: svc });
    await enforce(mkViolation({ supCode: 'SUP-001', severity: 'S2' }), deps);
    const envelope = submit.mock.calls[0]?.[0] as ControlCommandEnvelope;
    expect(envelope.action).toBe('stop_response');
  });

  it('S3 → warn_only short-circuit (no submit call)', async () => {
    const { svc, submit } = mkOpctlService({
      status: 'applied',
      control_command_id: randomUUID(),
    } as unknown as OpctlSubmitResult);
    const { deps } = mkDeps({ opctlService: svc });
    const result = await enforce(
      mkViolation({ supCode: 'SUP-009', severity: 'S3' }),
      deps,
    );
    expect(result.status).toBe('warn_only');
    expect(submit).not.toHaveBeenCalled();
  });
});

describe('enforce — UT-EN2 S3 short-circuit spy (SUPV-SP5-003)', () => {
  it('zero translator / opctl / witness / eventbus calls for S3', async () => {
    const witnessService = mkWitnessService();
    const eventBus = mkEventBus();
    const opctlSubmit = vi.fn();
    const { deps } = mkDeps({
      opctlService: { submitCommand: opctlSubmit as unknown as EnforcementOpctlService['submitCommand'] },
      witnessService,
      eventBus,
    });
    await enforce(mkViolation({ severity: 'S3', supCode: 'SUP-009' }), deps);
    expect(opctlSubmit).not.toHaveBeenCalled();
    expect(witnessService.appendInvariant).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });
});

describe('enforce — UT-EN3 applied branch', () => {
  it('enforce returns applied; witness + EventBus emit happen', async () => {
    const commandId = randomUUID();
    const { svc } = mkOpctlService({
      status: 'applied',
      control_command_id: commandId,
    } as unknown as OpctlSubmitResult);
    const witnessService = mkWitnessService();
    const eventBus = mkEventBus();
    const { deps } = mkDeps({
      opctlService: svc,
      witnessService,
      eventBus,
    });
    const result = await enforce(mkViolation(), deps);
    expect(result.status).toBe('applied');
    expect(witnessService.appendInvariant).toHaveBeenCalledTimes(1);
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    expect((eventBus.publish as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe(
      'supervisor:enforcement-action',
    );
  });
});

describe('enforce — UT-EN4 conflict_resolved branch', () => {
  it('blocked + opctl_conflict_resolved → EnforcementResult conflict_resolved', async () => {
    const { svc } = mkOpctlService({
      status: 'blocked',
      control_command_id: randomUUID(),
      reason: 'conflict',
      reason_code: 'opctl_conflict_resolved',
    } as unknown as OpctlSubmitResult);
    const witnessService = mkWitnessService();
    const eventBus = mkEventBus();
    const { deps } = mkDeps({ opctlService: svc, witnessService, eventBus });
    const result = await enforce(mkViolation(), deps);
    expect(result.status).toBe('conflict_resolved');
    if (result.status === 'conflict_resolved') {
      expect(result.reasonCode).toBe('opctl_conflict_resolved');
    }
    expect(witnessService.appendInvariant).toHaveBeenCalledTimes(1);
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
  });
});

describe('enforce — UT-EN5 rejected branch', () => {
  it('rejected + OPCTL-003 → EnforcementResult rejected', async () => {
    const { svc } = mkOpctlService({
      status: 'rejected',
      control_command_id: randomUUID(),
      reason: 'invalid proof',
      reason_code: 'OPCTL-003',
    } as unknown as OpctlSubmitResult);
    const witnessService = mkWitnessService();
    const eventBus = mkEventBus();
    const { deps } = mkDeps({ opctlService: svc, witnessService, eventBus });
    const result = await enforce(mkViolation(), deps);
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') {
      expect(result.reasonCode).toBe('OPCTL-003');
    }
    expect(witnessService.appendInvariant).toHaveBeenCalledTimes(1);
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
  });
});

describe('enforce — UT-EN6 S2 consumer-path EventBus emit (SP 6 SUPV-SP6-008)', () => {
  it('S2 + applied → supervisor:enforcement-action emits once; skip counter stays 0; witness still written', async () => {
    // WR-162 SP 6 flip: `SupervisorEnforcementActionPayloadSchema` widened to
    // admit `severity: 'S2'` + `action: 'stop_response'`; the SP 5 V1 skip
    // branch is removed. Pre-SP-6 this test asserted zero emits + counter ++.
    const { svc } = mkOpctlService({
      status: 'applied',
      control_command_id: randomUUID(),
    } as unknown as OpctlSubmitResult);
    const witnessService = mkWitnessService();
    const eventBus = mkEventBus();
    const metric = vi.fn();
    const { deps } = mkDeps({
      opctlService: svc,
      witnessService,
      eventBus,
      metric: metric as EnforcementDeps['metric'],
    });
    await enforce(mkViolation({ severity: 'S2' }), deps);
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    // Payload: `severity: 'S2'` + `action: 'stop_response'` per widened schema.
    const call = (eventBus.publish as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    expect(call?.[0]).toBe('supervisor:enforcement-action');
    const payload = call?.[1] as { severity: string; action: string };
    expect(payload.severity).toBe('S2');
    expect(payload.action).toBe('stop_response');
    expect(witnessService.appendInvariant).toHaveBeenCalledTimes(1);
    const names = metric.mock.calls.map((c) => c[0]);
    expect(names).not.toContain('supervisor_enforcement_s2_emit_skipped_total');
  });
});

describe('enforce — UT-EN7 no-heuristic-bandaid (SUPV-SP5-013)', () => {
  it('unknown OpctlSubmitResult.status throws EnforcementContractDefectError; no witness; no EventBus', async () => {
    const svc: EnforcementOpctlService = {
      submitCommand: async () =>
        ({
          status: 'unexpected_value',
          control_command_id: randomUUID(),
        } as unknown as OpctlSubmitResult),
    };
    const witnessService = mkWitnessService();
    const eventBus = mkEventBus();
    const { deps } = mkDeps({ opctlService: svc, witnessService, eventBus });
    await expect(enforce(mkViolation(), deps)).rejects.toBeInstanceOf(
      EnforcementContractDefectError,
    );
    expect(witnessService.appendInvariant).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });
});

describe('enforce — UT-EN8 submitCommand throws', () => {
  it('propagates; no witness row; no EventBus emit', async () => {
    const svc: EnforcementOpctlService = {
      submitCommand: async () => {
        throw new Error('witness service down');
      },
    };
    const witnessService = mkWitnessService();
    const eventBus = mkEventBus();
    const { deps } = mkDeps({ opctlService: svc, witnessService, eventBus });
    await expect(enforce(mkViolation(), deps)).rejects.toThrow(
      /witness service down/,
    );
    expect(witnessService.appendInvariant).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });
});

describe('enforce — UT-EN9 emitEnforcementWitness throws', () => {
  it('witness throws → metric; EnforcementResult.status stays applied; EventBus still attempted', async () => {
    const { svc } = mkOpctlService({
      status: 'applied',
      control_command_id: randomUUID(),
    } as unknown as OpctlSubmitResult);
    const witnessService: IWitnessService = {
      appendInvariant: vi.fn(async () => {
        throw new Error('witness down');
      }),
      appendAuthorization: vi.fn(),
      appendCompletion: vi.fn(),
      createCheckpoint: vi.fn(),
      rotateKeyEpoch: vi.fn(),
      verify: vi.fn(),
      getReport: vi.fn(),
      listReports: vi.fn(),
      getLatestCheckpoint: vi.fn(),
    } as unknown as IWitnessService;
    const eventBus = mkEventBus();
    const metric = vi.fn();
    const { deps } = mkDeps({
      opctlService: svc,
      witnessService,
      eventBus,
      metric: metric as EnforcementDeps['metric'],
    });
    const result = await enforce(mkViolation(), deps);
    expect(result.status).toBe('applied');
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    const names = metric.mock.calls.map((c) => c[0]);
    expect(names).toContain('supervisor_enforcement_witness_failed_total');
  });
});

describe('enforce — UT-EN10 eventBus.publish throws', () => {
  it('EventBus throws → metric; EnforcementResult.status stays applied; witness row written', async () => {
    const { svc } = mkOpctlService({
      status: 'applied',
      control_command_id: randomUUID(),
    } as unknown as OpctlSubmitResult);
    const witnessService = mkWitnessService();
    const eventBus: IEventBus = {
      publish: vi.fn(() => {
        throw new Error('bus down');
      }),
      subscribe: vi.fn(() => 'sub-id'),
      unsubscribe: vi.fn(),
      dispose: vi.fn(),
    };
    const metric = vi.fn();
    const { deps } = mkDeps({
      opctlService: svc,
      witnessService,
      eventBus,
      metric: metric as EnforcementDeps['metric'],
    });
    const result = await enforce(mkViolation(), deps);
    expect(result.status).toBe('applied');
    expect(witnessService.appendInvariant).toHaveBeenCalledTimes(1);
    const names = metric.mock.calls.map((c) => c[0]);
    expect(names).toContain('supervisor_enforcement_eventbus_failed_total');
  });
});
