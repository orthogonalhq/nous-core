/**
 * WR-162 SP 6 — SentinelModule unit tests (UT-SN1..UT-SN12).
 *
 * Threshold matrix, dispatch order, enforcement-boundary invariant, composite
 * risk aggregation, fake-timer scoping, window-deque eviction, and idle-fire
 * suppression. Per SUPV-SP6-001 / SUPV-SP6-002 / SDS § Observability.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IEventBus, ILogChannel } from '@nous/shared';
import { RingBuffer } from '../ring-buffer.js';
import {
  createSentinelModule,
  SentinelContractDefectError,
  type SentinelDeps,
  type SentinelThresholds,
  type SupervisorAnomalyRecord,
} from '../sentinel.js';

const DEFAULT_THRESHOLDS: SentinelThresholds = {
  retryCountPerWindow: 10,
  retryWindowSeconds: 60,
  escalationCountPerWindow: 3,
  escalationWindowSeconds: 60,
  stalledAgentIdleSeconds: 300,
  heartbeatIntervalMs: 5000,
};

const AGENT_A = 'agent-A';
const AGENT_B = 'agent-B';
const PROJECT_P1 = '550e8400-e29b-41d4-a716-446655440001';
const PROJECT_P2 = '550e8400-e29b-41d4-a716-446655440002';
const RUN_R1 = '660e8400-e29b-41d4-a716-446655440011';

function mkDeps(overrides: Partial<SentinelDeps> = {}): {
  deps: SentinelDeps;
  anomalyBuffer: RingBuffer<SupervisorAnomalyRecord>;
  eventBusPublish: ReturnType<typeof vi.fn>;
  emitWitness: ReturnType<typeof vi.fn>;
  logger: ILogChannel;
} {
  const anomalyBuffer = new RingBuffer<SupervisorAnomalyRecord>(200);
  const eventBusPublish = vi.fn(async () => undefined);
  const eventBus = {
    publish: eventBusPublish,
    subscribe: vi.fn(() => () => undefined),
    unsubscribe: vi.fn(),
    dispose: vi.fn(),
  } as unknown as IEventBus;
  const emitWitness = vi.fn(async () => undefined);
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    isEnabled: vi.fn(() => true),
  } as unknown as ILogChannel;
  const deps: SentinelDeps = {
    getNow: () => new Date().toISOString(),
    thresholds: DEFAULT_THRESHOLDS,
    anomalyBuffer,
    emitWitness: emitWitness as unknown as SentinelDeps['emitWitness'],
    eventBus,
    metric: vi.fn(),
    logger,
    ...overrides,
  };
  return { deps, anomalyBuffer, eventBusPublish, emitWitness, logger };
}

function iso(sec: number): string {
  return new Date(sec * 1000).toISOString();
}

describe('UT-SN1 — SUP-009 retry threshold matrix', () => {
  it('11 retry events within 60s fires with clamped risk_score (1.0)', () => {
    const { deps } = mkDeps();
    const sentinel = createSentinelModule(deps);
    let last: ReturnType<typeof sentinel.observe> = null;
    for (let i = 0; i < 11; i++) {
      last = sentinel.observe({
        type: 'outbox-retry',
        agentId: AGENT_A,
        agentClass: 'worker',
        projectId: PROJECT_P1,
        runId: RUN_R1,
        at: iso(i),
      });
    }
    expect(last).not.toBeNull();
    expect(last?.sup_code).toBe('SUP-009');
    expect(last?.risk_score).toBe(1);
    expect(last?.explanation).toContain(`agent_id=${AGENT_A}`);
    expect(last?.explanation).toContain('retry count 11');
    expect(last?.explanation).toContain('threshold 10');
  });

  it('10 retry events within 60s does NOT fire (exact-boundary)', () => {
    const { deps } = mkDeps();
    const sentinel = createSentinelModule(deps);
    let last: ReturnType<typeof sentinel.observe> = null;
    for (let i = 0; i < 10; i++) {
      last = sentinel.observe({
        type: 'outbox-retry',
        agentId: AGENT_A,
        agentClass: 'worker',
        projectId: PROJECT_P1,
        runId: RUN_R1,
        at: iso(i),
      });
    }
    expect(last).toBeNull();
  });
});

describe('UT-SN2 — SUP-010 escalation threshold matrix', () => {
  it('4 escalations within 60s fires; 3 does not', () => {
    const { deps } = mkDeps();
    const sentinel = createSentinelModule(deps);
    let r: ReturnType<typeof sentinel.observe> = null;
    for (let i = 0; i < 3; i++) {
      r = sentinel.observe({
        type: 'outbox-escalation',
        agentId: AGENT_A,
        agentClass: 'worker',
        projectId: PROJECT_P1,
        runId: RUN_R1,
        at: iso(i),
      });
    }
    expect(r).toBeNull();
    r = sentinel.observe({
      type: 'outbox-escalation',
      agentId: AGENT_A,
      agentClass: 'worker',
      projectId: PROJECT_P1,
      runId: RUN_R1,
      at: iso(3),
    });
    expect(r).not.toBeNull();
    expect(r?.sup_code).toBe('SUP-010');
  });
});

describe('UT-SN3 — SUP-011 stalled agent threshold', () => {
  it('sweep fires for elapsed > 300s; 299s does not; marker suppresses re-fire', () => {
    const startMs = 1_000_000_000_000;
    let nowMs = startMs;
    const { deps } = mkDeps({
      getNow: () => new Date(nowMs).toISOString(),
    });
    const sentinel = createSentinelModule(deps);
    // Seed activity at t0.
    sentinel.observe({
      type: 'health-sink-activity',
      agentId: AGENT_A,
      agentClass: 'worker',
      projectId: PROJECT_P1,
      runId: RUN_R1,
      at: new Date(startMs).toISOString(),
    });
    // t+299s — does NOT fire.
    nowMs = startMs + 299 * 1000;
    expect(sentinel.sweepIdleAgents()).toHaveLength(0);
    // t+301s — fires.
    nowMs = startMs + 301 * 1000;
    const first = sentinel.sweepIdleAgents();
    expect(first).toHaveLength(1);
    expect(first[0]?.sup_code).toBe('SUP-011');
    // Re-sweep at t+310s — marker suppresses.
    nowMs = startMs + 310 * 1000;
    expect(sentinel.sweepIdleAgents()).toHaveLength(0);
  });
});

describe('UT-SN4 — SUP-012 unknown-tool ratio', () => {
  it('2 known + 1 unknown → risk_score = 1/3; zero unknown → 0 (no fire)', () => {
    const { deps } = mkDeps();
    const sentinel = createSentinelModule(deps);
    const expected = new Set(['tool_a', 'tool_b']);
    // Call tool_a twice (known) — no fire because ratio is 0.
    for (let i = 0; i < 2; i++) {
      const r = sentinel.observe({
        type: 'tool-call',
        agentId: AGENT_A,
        agentClass: 'worker',
        projectId: PROJECT_P1,
        runId: RUN_R1,
        at: iso(i),
        toolName: 'tool_a',
        expectedToolSurface: expected,
      });
      expect(r).toBeNull();
    }
    // Call tool_c once (unknown) — ratio 1/3, fires.
    const fired = sentinel.observe({
      type: 'tool-call',
      agentId: AGENT_A,
      agentClass: 'worker',
      projectId: PROJECT_P1,
      runId: RUN_R1,
      at: iso(2),
      toolName: 'tool_c',
      expectedToolSurface: expected,
    });
    expect(fired).not.toBeNull();
    expect(fired?.sup_code).toBe('SUP-012');
    expect(fired?.risk_score).toBeCloseTo(1 / 3, 6);
  });

  it('zero calls → zero risk (no divide-by-zero)', () => {
    const { deps } = mkDeps();
    const sentinel = createSentinelModule(deps);
    // No observation yet; getComposite should return empty.
    const composites = sentinel.getCompositeRiskScores();
    expect(composites).toEqual([]);
  });
});

describe('UT-SN5 — observe type mismatch', () => {
  it('unknown observation type throws SentinelContractDefectError', () => {
    const { deps } = mkDeps();
    const sentinel = createSentinelModule(deps);
    expect(() =>
      sentinel.observe({ type: 'unexpected' } as never),
    ).toThrow(SentinelContractDefectError);
  });
});

describe('UT-SN6 — dispatchClassification three-step order', () => {
  it('calls anomalyBuffer.push, eventBus.publish, emitWitness exactly once each', async () => {
    const { deps, anomalyBuffer, eventBusPublish, emitWitness } = mkDeps();
    const sentinel = createSentinelModule(deps);
    await sentinel.dispatchClassification({
      sup_code: 'SUP-010',
      agent_id: AGENT_A,
      agent_class: 'worker',
      project_id: PROJECT_P1,
      run_id: RUN_R1,
      risk_score: 0.75,
      explanation: 'synthetic',
      classified_at: iso(100),
    });
    expect(anomalyBuffer.snapshot()).toHaveLength(1);
    expect(eventBusPublish).toHaveBeenCalledTimes(1);
    expect(eventBusPublish).toHaveBeenCalledWith(
      'supervisor:anomaly-classified',
      expect.objectContaining({ sup_code: 'SUP-010', risk_score: 0.75 }),
    );
    expect(emitWitness).toHaveBeenCalledTimes(1);
    expect(emitWitness).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'S3', sup_code: 'SUP-010' }),
    );
  });
});

describe('UT-SN7 — dispatchClassification never touches enforcement', () => {
  it('does not publish supervisor:enforcement-action on the sentinel dispatch path', async () => {
    const { deps, eventBusPublish } = mkDeps();
    const sentinel = createSentinelModule(deps);
    await sentinel.dispatchClassification({
      sup_code: 'SUP-009',
      agent_id: AGENT_A,
      agent_class: 'worker',
      project_id: PROJECT_P1,
      run_id: RUN_R1,
      risk_score: 0.6,
      explanation: 'synthetic',
      classified_at: iso(100),
    });
    const channels = eventBusPublish.mock.calls.map((c) => c[0]);
    expect(channels).toContain('supervisor:anomaly-classified');
    expect(channels).not.toContain('supervisor:enforcement-action');
  });
});

describe('UT-SN8 — composite risk aggregation (same project)', () => {
  it('max(risk) across multiple SUP codes in one project', async () => {
    const { deps } = mkDeps();
    const sentinel = createSentinelModule(deps);
    for (const [sup_code, risk_score] of [
      ['SUP-009', 0.4] as const,
      ['SUP-010', 0.8] as const,
      ['SUP-012', 0.2] as const,
    ]) {
      await sentinel.dispatchClassification({
        sup_code,
        agent_id: AGENT_A,
        agent_class: 'worker',
        project_id: PROJECT_P1,
        run_id: RUN_R1,
        risk_score,
        explanation: `synthetic-${sup_code}`,
        classified_at: iso(100),
      });
    }
    const composites = sentinel.getCompositeRiskScores({ projectId: PROJECT_P1 });
    expect(composites).toHaveLength(1);
    expect(composites[0]?.compositeRiskScore).toBe(0.8);
    expect(composites[0]?.activeAnomalies).toHaveLength(3);
  });
});

describe('UT-SN9 — composite risk aggregation (different projects)', () => {
  it('aggregates independently per project', async () => {
    const { deps } = mkDeps();
    const sentinel = createSentinelModule(deps);
    await sentinel.dispatchClassification({
      sup_code: 'SUP-009',
      agent_id: AGENT_A,
      agent_class: 'worker',
      project_id: PROJECT_P1,
      run_id: RUN_R1,
      risk_score: 0.7,
      explanation: 'p1',
      classified_at: iso(100),
    });
    await sentinel.dispatchClassification({
      sup_code: 'SUP-010',
      agent_id: AGENT_B,
      agent_class: 'worker',
      project_id: PROJECT_P2,
      run_id: RUN_R1,
      risk_score: 0.3,
      explanation: 'p2',
      classified_at: iso(100),
    });
    const asRecord = sentinel.getCompositeRiskScoresAsRecord();
    expect(asRecord[PROJECT_P1]).toBe(0.7);
    expect(asRecord[PROJECT_P2]).toBe(0.3);
  });
});

describe('UT-SN10 — fake-timer scoping', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('module constructs under fake timers without state leakage', () => {
    const { deps } = mkDeps();
    const sentinel = createSentinelModule(deps);
    expect(sentinel).toBeDefined();
  });
});

describe('UT-SN11 — window-deque eviction', () => {
  it('entries older than retryWindowSeconds are evicted on each observe', () => {
    const { deps } = mkDeps();
    const sentinel = createSentinelModule(deps);
    // Seed 20 retries at t=0..t=19s.
    for (let i = 0; i < 20; i++) {
      sentinel.observe({
        type: 'outbox-retry',
        agentId: AGENT_A,
        agentClass: 'worker',
        projectId: PROJECT_P1,
        runId: RUN_R1,
        at: iso(i),
      });
    }
    // At t=80s, add one more — all 20 older entries older than 20s are outside
    // the 60s window, so deque contains only the new entry. Threshold not met.
    const r = sentinel.observe({
      type: 'outbox-retry',
      agentId: AGENT_A,
      agentClass: 'worker',
      projectId: PROJECT_P1,
      runId: RUN_R1,
      at: iso(80),
    });
    expect(r).toBeNull();
  });
});

describe('UT-SN12 — idle-window fire-suppression', () => {
  it('re-sweep within same idle window does not re-fire; activity resumption clears marker', () => {
    const startMs = 1_000_000_000_000;
    let nowMs = startMs;
    const { deps } = mkDeps({
      getNow: () => new Date(nowMs).toISOString(),
    });
    const sentinel = createSentinelModule(deps);
    // Seed activity.
    sentinel.observe({
      type: 'health-sink-activity',
      agentId: AGENT_A,
      agentClass: 'worker',
      projectId: PROJECT_P1,
      runId: RUN_R1,
      at: new Date(startMs).toISOString(),
    });
    // t+400s → fires once.
    nowMs = startMs + 400 * 1000;
    expect(sentinel.sweepIdleAgents()).toHaveLength(1);
    // t+500s → suppressed.
    nowMs = startMs + 500 * 1000;
    expect(sentinel.sweepIdleAgents()).toHaveLength(0);
    // Activity resumes at t+600s (marker cleared).
    nowMs = startMs + 600 * 1000;
    sentinel.observe({
      type: 'health-sink-activity',
      agentId: AGENT_A,
      agentClass: 'worker',
      projectId: PROJECT_P1,
      runId: RUN_R1,
      at: new Date(nowMs).toISOString(),
    });
    // t+950s → re-fires (new idle window).
    nowMs = startMs + 950 * 1000;
    expect(sentinel.sweepIdleAgents()).toHaveLength(1);
  });
});
