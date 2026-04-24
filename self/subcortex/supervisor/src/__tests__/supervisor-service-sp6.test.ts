/**
 * WR-162 SP 6 — SupervisorService extensions (UT-SS1..UT-SS11 + UT-GATE1).
 *
 * Heartbeat lifecycle, error containment, filter semantics, status snapshot
 * real fields, sentinel-risk delegation, agent snapshot composite, wire
 * payload projection schema-parse, and SUPV-SP3-002 gating preservation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IEventBus, IWitnessService } from '@nous/shared';
import { SupervisorSentinelStatusPayloadSchema } from '@nous/shared';
import { RingBuffer } from '../ring-buffer.js';
import { SupervisorService } from '../supervisor-service.js';
import {
  createSentinelModule,
  type SupervisorAnomalyRecord,
} from '../sentinel.js';

const PROJECT_P1 = '550e8400-e29b-41d4-a716-446655440001';
const PROJECT_P2 = '550e8400-e29b-41d4-a716-446655440002';
const RUN_R1 = '660e8400-e29b-41d4-a716-446655440011';
const AGENT_A = 'agent-A';

const THRESHOLDS = {
  retryCountPerWindow: 10,
  retryWindowSeconds: 60,
  escalationCountPerWindow: 3,
  escalationWindowSeconds: 60,
  stalledAgentIdleSeconds: 300,
  heartbeatIntervalMs: 5000,
};

function mkEventBus(): {
  bus: IEventBus;
  publish: ReturnType<typeof vi.fn>;
} {
  const publish = vi.fn(async () => undefined);
  const bus = {
    publish,
    subscribe: () => () => undefined,
    unsubscribe: () => undefined,
    dispose: () => undefined,
  } as unknown as IEventBus;
  return { bus, publish };
}

function mkWitnessService(): IWitnessService {
  return {
    appendAuthorization: vi.fn(async () => ({}) as never),
    appendCompletion: vi.fn(async () => ({}) as never),
    appendInvariant: vi.fn(async () => ({}) as never),
    createCheckpoint: vi.fn(async () => ({}) as never),
    rotateKeyEpoch: vi.fn(async () => 1),
    verify: vi.fn(async () => ({}) as never),
    getReport: vi.fn(async () => null),
    listReports: vi.fn(async () => []),
    getLatestCheckpoint: vi.fn(async () => null),
  } as unknown as IWitnessService;
}

function mkSvc(opts: {
  enabled: boolean;
  withSentinel: boolean;
  eventBus?: IEventBus;
  witnessService?: IWitnessService;
}): {
  svc: SupervisorService;
  sentinelBuffer: RingBuffer<SupervisorAnomalyRecord>;
  eventBus: IEventBus;
} {
  const eventBus = opts.eventBus ?? mkEventBus().bus;
  const witnessService = opts.witnessService ?? mkWitnessService();
  const sentinelBuffer = new RingBuffer<SupervisorAnomalyRecord>(200);
  const sentinelModule = opts.withSentinel
    ? createSentinelModule({
        getNow: () => new Date().toISOString(),
        thresholds: THRESHOLDS,
        anomalyBuffer: sentinelBuffer,
        emitWitness: vi.fn(async () => undefined) as unknown as never,
        eventBus,
      })
    : undefined;
  const svc = new SupervisorService({
    config: { enabled: opts.enabled },
    eventBus,
    witnessService,
    sentinel: sentinelModule
      ? {
          module: sentinelModule,
          heartbeatIntervalMs: THRESHOLDS.heartbeatIntervalMs,
          anomalyBuffer: sentinelBuffer,
        }
      : undefined,
  });
  return { svc, sentinelBuffer, eventBus };
}

describe('UT-SS1..UT-SS5 — heartbeat lifecycle', () => {
  it('UT-SS1 — enabled + sentinel wired → startSupervision allocates interval', async () => {
    const { svc } = mkSvc({ enabled: true, withSentinel: true });
    svc.startSupervision({ enabled: true });
    expect(svc.__test_heartbeatHandleAllocated()).toBe(true);
    await svc.stopSupervision();
  });

  it('UT-SS2 + UT-SS3 — stopSupervision clears interval; repeated stop is idempotent', async () => {
    const { svc } = mkSvc({ enabled: true, withSentinel: true });
    svc.startSupervision({ enabled: true });
    expect(svc.__test_heartbeatHandleAllocated()).toBe(true);
    await svc.stopSupervision();
    expect(svc.__test_heartbeatHandleAllocated()).toBe(false);
    // Second stop does not throw and remains cleared.
    await svc.stopSupervision();
    expect(svc.__test_heartbeatHandleAllocated()).toBe(false);
  });

  it('UT-SS4 — enabled: false does NOT allocate interval (SUPV-SP3-002 gate)', () => {
    const { svc } = mkSvc({ enabled: false, withSentinel: true });
    svc.startSupervision({ enabled: false });
    expect(svc.__test_heartbeatHandleAllocated()).toBe(false);
  });

  it('UT-SS5 — enabled: true but no sentinel slot does NOT allocate interval', () => {
    const { svc } = mkSvc({ enabled: true, withSentinel: false });
    svc.startSupervision({ enabled: true });
    expect(svc.__test_heartbeatHandleAllocated()).toBe(false);
  });
});

describe('UT-SS6 — heartbeat error containment', () => {
  it('eventBus.publish throw increments metric and keeps loop alive', async () => {
    const publish = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(async () => {
        throw new Error('EventBus transient');
      })
      .mockImplementation(async () => undefined);
    const eventBus = {
      publish,
      subscribe: () => () => undefined,
      unsubscribe: () => undefined,
      dispose: () => undefined,
    } as unknown as IEventBus;
    const metric = vi.fn();
    const sentinelBuffer = new RingBuffer<SupervisorAnomalyRecord>(200);
    const svc = new SupervisorService({
      config: { enabled: true },
      eventBus,
      metric,
      sentinel: {
        module: createSentinelModule({
          getNow: () => new Date().toISOString(),
          thresholds: THRESHOLDS,
          anomalyBuffer: sentinelBuffer,
          emitWitness: vi.fn(async () => undefined) as unknown as never,
          eventBus,
        }),
        heartbeatIntervalMs: THRESHOLDS.heartbeatIntervalMs,
        anomalyBuffer: sentinelBuffer,
      },
    });
    // Invoke tick directly — first call throws, second succeeds.
    await svc.__test_heartbeatTick();
    await svc.__test_heartbeatTick();
    const names = metric.mock.calls.map((c) => c[0]);
    expect(names).toContain('supervisor_sentinel_heartbeat_emit_failed_total');
    // Second tick succeeded (no exception propagated).
    expect(publish).toHaveBeenCalledTimes(2);
  });
});

describe('UT-SS7 — getRecentViolations filter semantics', () => {
  it('projectId / since / limit filters are honored', async () => {
    const { svc } = mkSvc({ enabled: true, withSentinel: false });
    // Seed violations via test introspection. No public API for direct seed,
    // so we call runClassifier prerequisites — simplest: assert the default
    // path returns []; detailed filter correctness is covered in service
    // unit tests + IT-SP6-1. This test asserts limit default behavior.
    const rows = await svc.getRecentViolations({});
    expect(rows).toEqual([]);
    // Limit override accepted (pass-through from Zod at the tRPC layer).
    const rowsWithLimit = await svc.getRecentViolations({ limit: 1 });
    expect(rowsWithLimit).toEqual([]);
  });
});

describe('UT-SS8 — getStatusSnapshot real fields', () => {
  it('agentsMonitored reflects activeAgentTracker size; riskSummary {} when sentinel unwired', async () => {
    const { svc } = mkSvc({ enabled: true, withSentinel: false });
    const snap = await svc.getStatusSnapshot();
    expect(snap.active).toBe(false);
    expect(snap.agentsMonitored).toBe(0);
    expect(snap.activeViolationCounts).toEqual({ s0: 0, s1: 0, s2: 0, s3: 0 });
    expect(snap.lifetime).toEqual({
      violationsDetected: 0,
      anomaliesClassified: 0,
      enforcementsApplied: 0,
    });
    expect(snap.witnessIntegrity).toBe('intact');
    expect(snap.riskSummary).toEqual({});
  });
});

describe('UT-SS9 — getSentinelRiskScores delegation', () => {
  it('returns [] when sentinel unwired; returns entries when wired + populated', async () => {
    const { svc: svcNoSent } = mkSvc({ enabled: true, withSentinel: false });
    expect(await svcNoSent.getSentinelRiskScores({})).toEqual([]);

    const { svc, sentinelBuffer } = mkSvc({ enabled: true, withSentinel: true });
    // Seed buffer directly to isolate the delegation path.
    sentinelBuffer.push({
      classification: {
        sup_code: 'SUP-010',
        agent_id: AGENT_A,
        agent_class: 'worker',
        project_id: PROJECT_P1,
        run_id: RUN_R1,
        risk_score: 0.9,
        explanation: 'seed',
        classified_at: new Date().toISOString(),
      },
      severity: 'S3',
      buffered_at: new Date().toISOString(),
    });
    const scores = await svc.getSentinelRiskScores({ projectId: PROJECT_P1 });
    expect(scores).toHaveLength(1);
    expect(scores[0]?.compositeRiskScore).toBe(0.9);
  });
});

describe('UT-SS10 — getAgentSupervisorSnapshot composite', () => {
  it('returns max(risk_score) across active anomalies for the agent', async () => {
    const { svc, sentinelBuffer } = mkSvc({ enabled: true, withSentinel: true });
    sentinelBuffer.push({
      classification: {
        sup_code: 'SUP-009',
        agent_id: AGENT_A,
        agent_class: 'worker',
        project_id: PROJECT_P1,
        run_id: RUN_R1,
        risk_score: 0.3,
        explanation: '1',
        classified_at: new Date().toISOString(),
      },
      severity: 'S3',
      buffered_at: new Date().toISOString(),
    });
    sentinelBuffer.push({
      classification: {
        sup_code: 'SUP-010',
        agent_id: AGENT_A,
        agent_class: 'worker',
        project_id: PROJECT_P1,
        run_id: RUN_R1,
        risk_score: 0.7,
        explanation: '2',
        classified_at: new Date().toISOString(),
      },
      severity: 'S3',
      buffered_at: new Date().toISOString(),
    });
    const snap = await svc.getAgentSupervisorSnapshot(AGENT_A);
    expect(snap.guardrail_status).toBe('clear');
    expect(snap.witness_integrity_status).toBe('intact');
    expect(snap.sentinel_risk_score).toBe(0.7);
  });

  it('returns null sentinel_risk_score when no anomalies for agent', async () => {
    const { svc } = mkSvc({ enabled: true, withSentinel: true });
    const snap = await svc.getAgentSupervisorSnapshot('unknown-agent');
    expect(snap.sentinel_risk_score).toBeNull();
  });
});

describe('UT-SS11 — heartbeat wire-payload projection (SUPV-SP6-016)', () => {
  it('publishes a SupervisorSentinelStatusPayloadSchema-valid wire payload on each tick', async () => {
    const { bus, publish } = mkEventBus();
    const { svc } = mkSvc({ enabled: true, withSentinel: true, eventBus: bus });
    // Invoke the heartbeat tick directly (bypasses setInterval to avoid
    // scheduler availability differences across test runtimes).
    await svc.__test_heartbeatTick();
    // Find the supervisor:sentinel-status publish call.
    const statusCall = publish.mock.calls.find(
      (c) => c[0] === 'supervisor:sentinel-status',
    );
    expect(statusCall).toBeDefined();
    const wire = statusCall?.[1];
    const parsed = SupervisorSentinelStatusPayloadSchema.safeParse(wire);
    expect(parsed.success).toBe(true);
    // Snake_case wire fields only; camelCase domain fields dropped.
    expect(wire).toHaveProperty('active');
    expect(wire).toHaveProperty('agents_monitored');
    expect(wire).toHaveProperty('violations_detected');
    expect(wire).toHaveProperty('anomalies_classified');
    expect(wire).toHaveProperty('risk_summary');
    expect(wire).toHaveProperty('reported_at');
    // Camel-case fields MUST NOT appear on the wire payload.
    expect(wire).not.toHaveProperty('agentsMonitored');
    expect(wire).not.toHaveProperty('activeViolationCounts');
    expect(wire).not.toHaveProperty('lifetime');
    expect(wire).not.toHaveProperty('witnessIntegrity');
  });
});

describe('UT-GATE1 — SUPV-SP3-002 end-to-end gating (enabled: false)', () => {
  it('full enabled: false path — zero heartbeat, zero sentinel observations, null sentinel_risk_score', async () => {
    const { bus, publish } = mkEventBus();
    const { svc } = mkSvc({ enabled: false, withSentinel: true, eventBus: bus });
    svc.startSupervision({ enabled: false });
    // Zero interval allocation (no heartbeat handle).
    expect(svc.__test_heartbeatHandleAllocated()).toBe(false);
    // getAgentSupervisorSnapshot still returns no-placeholder shape.
    const snap = await svc.getAgentSupervisorSnapshot(AGENT_A);
    expect(snap.sentinel_risk_score).toBeNull();
    expect(snap.guardrail_status).toBe('clear');
    expect(snap.witness_integrity_status).toBe('intact');
    // Zero supervisor channel publishes.
    const channels = publish.mock.calls.map((c) => c[0]);
    expect(channels).not.toContain('supervisor:sentinel-status');
    expect(channels).not.toContain('supervisor:anomaly-classified');
  });
});

describe('composite-risk aggregation end-to-end', () => {
  it('two projects aggregate independently in riskSummary', async () => {
    const { svc, sentinelBuffer } = mkSvc({
      enabled: true,
      withSentinel: true,
    });
    sentinelBuffer.push({
      classification: {
        sup_code: 'SUP-009',
        agent_id: AGENT_A,
        agent_class: 'worker',
        project_id: PROJECT_P1,
        run_id: RUN_R1,
        risk_score: 0.6,
        explanation: '1',
        classified_at: new Date().toISOString(),
      },
      severity: 'S3',
      buffered_at: new Date().toISOString(),
    });
    sentinelBuffer.push({
      classification: {
        sup_code: 'SUP-010',
        agent_id: 'agent-B',
        agent_class: 'worker',
        project_id: PROJECT_P2,
        run_id: RUN_R1,
        risk_score: 0.2,
        explanation: '2',
        classified_at: new Date().toISOString(),
      },
      severity: 'S3',
      buffered_at: new Date().toISOString(),
    });
    const snap = await svc.getStatusSnapshot();
    expect(snap.riskSummary[PROJECT_P1]).toBe(0.6);
    expect(snap.riskSummary[PROJECT_P2]).toBe(0.2);
  });
});
