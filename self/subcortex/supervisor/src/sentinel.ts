/**
 * WR-162 SP 6 — Sentinel classifier module.
 *
 * Deterministic threshold-based anomaly classifier for SUP-009..SUP-012 per
 * `.architecture/.decisions/2026-03-23-kernel-safety/sentinel-model-contract-v1.md`.
 * V1 posture: rule-based, NOT model inference. Output shape matches the SP 1
 * `SentinelRiskScore`-compatible shape so post-V1 model binding replaces ONLY
 * the per-SUP rule internals without changing the output contract.
 *
 * Classification map (deterministic rules):
 * - SUP-009 — retry storm: `count(retry events in window) > retryCountPerWindow`.
 * - SUP-010 — escalation storm: `count(escalation events in window) > escalationCountPerWindow`.
 * - SUP-011 — stalled agent: `now - lastActivity > stalledAgentIdleSeconds`.
 * - SUP-012 — anomalous tool-usage: `unknown_count / total_count` ratio (>0 fires).
 *
 * S3 dispatch path bypasses OpctlService entirely — sentinel writes the
 * anomaly buffer, emits `supervisor:anomaly-classified` on EventBus, and emits
 * a `supervisor-detection` witness with `severity: 'S3'` / `actor: 'supervisor'`.
 * Per `supervisor-escalation-policy-v1.md § S3 Warn Path`.
 *
 * SUPV-SP6-001 / SUPV-SP6-002 / SUPV-SP6-013 — no second `enabled` gate
 * inside this module; the caller (`SupervisorService`) gates at construction.
 */
import type {
  IEventBus,
  ILogChannel,
  IWitnessService,
  SupervisorAnomalyClassifiedPayload,
} from '@nous/shared';
import type { RingBuffer } from './ring-buffer.js';
import type { SupervisorMetricCounter } from './supervisor-service.js';

/**
 * Threshold configuration consumed from `SupervisorBootstrapConfig.sentinelThresholds`
 * (defined in `@nous/autonomic-config`). Structural subset imported here so
 * the sentinel module does not take a direct dependency on the config package.
 */
export interface SentinelThresholds {
  readonly retryCountPerWindow: number;
  readonly retryWindowSeconds: number;
  readonly escalationCountPerWindow: number;
  readonly escalationWindowSeconds: number;
  readonly stalledAgentIdleSeconds: number;
  readonly heartbeatIntervalMs: number;
}

/**
 * One classification result from the sentinel. Shape-compatible with the
 * per-code entry used internally by `SentinelModule` return types — the
 * landed SP 1 `SentinelRiskScore` domain type is the project-level composite
 * (`{ projectId, compositeRiskScore, activeAnomalies[] }`); the per-code row
 * shape here matches `SupervisorAnomalyClassifiedPayload` minus the
 * `triggering_event_refs` / `agent_class` fields the dispatcher fills in.
 */
export interface SentinelClassificationResult {
  readonly sup_code: 'SUP-009' | 'SUP-010' | 'SUP-011' | 'SUP-012';
  readonly agent_id: string;
  readonly agent_class: string;
  readonly project_id: string;
  readonly run_id: string;
  readonly risk_score: number; // 0..1
  readonly explanation: string;
  readonly classified_at: string; // ISO-8601
}

/**
 * Ring-buffer entry wrapping a classification with provenance + idle-fire
 * suppression state for SUP-011.
 */
export interface SupervisorAnomalyRecord {
  readonly classification: SentinelClassificationResult;
  readonly severity: 'S3';
  readonly buffered_at: string;
  readonly idle_window_marker?: {
    readonly threshold_seconds: number;
    readonly last_activity_at: string;
  };
}

/**
 * Input discriminated union for `SentinelModule.observe(...)`. Each variant
 * carries the identity quadruple + observation-specific fields.
 */
export type SentinelObservationIngress =
  | {
      readonly type: 'outbox-retry';
      readonly agentId: string;
      readonly agentClass: string;
      readonly projectId: string;
      readonly runId: string;
      readonly at: string; // ISO-8601
    }
  | {
      readonly type: 'outbox-escalation';
      readonly agentId: string;
      readonly agentClass: string;
      readonly projectId: string;
      readonly runId: string;
      readonly at: string;
    }
  | {
      readonly type: 'health-sink-activity';
      readonly agentId: string;
      readonly agentClass: string;
      readonly projectId: string;
      readonly runId: string;
      readonly at: string;
    }
  | {
      readonly type: 'tool-call';
      readonly agentId: string;
      readonly agentClass: string;
      readonly projectId: string;
      readonly runId: string;
      readonly at: string;
      readonly toolName: string;
      readonly expectedToolSurface?: ReadonlySet<string>;
    };

/**
 * Witness-emit binding. The caller wires this to a wrapper around
 * `appendInvariant` with `actionCategory: 'supervisor-detection'` + `actor: 'supervisor'`.
 */
export interface SentinelWitnessArgs {
  readonly severity: 'S3';
  readonly sup_code: string;
  readonly agent_id: string;
  readonly agent_class: string;
  readonly project_id: string;
  readonly run_id: string;
  readonly classified_at: string;
  readonly risk_score: number;
  readonly evidence_refs: readonly string[];
  readonly explanation: string;
}

/**
 * Per-project composite entry. Shape mirrors the SP 1 `SentinelRiskScore`
 * schema at `self/shared/src/types/supervisor.ts:87–101` (projectId +
 * compositeRiskScore + activeAnomalies[]).
 */
export interface SentinelCompositeEntry {
  readonly projectId: string;
  readonly compositeRiskScore: number;
  readonly activeAnomalies: ReadonlyArray<{
    readonly supCode: string;
    readonly riskScore: number;
    readonly explanation: string;
    readonly agentId: string;
    readonly classifiedAt: string;
  }>;
  readonly reportedAt: string;
}

export interface SentinelDeps {
  readonly getNow: () => string;
  readonly thresholds: SentinelThresholds;
  readonly anomalyBuffer: RingBuffer<SupervisorAnomalyRecord>;
  readonly emitWitness: (args: SentinelWitnessArgs) => Promise<void>;
  readonly eventBus: IEventBus;
  readonly metric?: SupervisorMetricCounter;
  readonly logger?: ILogChannel;
}

export interface SentinelModule {
  /**
   * Feed one observation. May return 0..1 classification.
   * Classification side-effects (buffer push, EventBus publish, witness emit)
   * are separated into `dispatchClassification` so the caller can sequence
   * them post-observe.
   */
  observe(obs: SentinelObservationIngress): SentinelClassificationResult | null;

  /**
   * Emit the anomaly classification side effects:
   *  (i)  push to anomaly ring buffer,
   *  (ii) publish `supervisor:anomaly-classified` on EventBus,
   *  (iii) emit `supervisor-detection` S3-flavour witness.
   * NEVER calls `enforce(...)`, NEVER calls opctl, NEVER emits
   * `supervisor:enforcement-action` or `supervisor-enforcement` witnesses.
   */
  dispatchClassification(c: SentinelClassificationResult): Promise<void>;

  /** Sweep `perAgentLastActivity` for idle agents and emit SUP-011 classifications. */
  sweepIdleAgents(): SentinelClassificationResult[];

  /** Per-project composite `max(risk)` over buffered anomalies. */
  getCompositeRiskScores(filter?: {
    projectId?: string;
  }): ReadonlyArray<SentinelCompositeEntry>;

  /**
   * Flat `Record<projectId, number>` projection of composite risks, matching
   * the `SupervisorStatusSnapshot.riskSummary` and
   * `SupervisorSentinelStatusPayload.risk_summary` wire field shape.
   */
  getCompositeRiskScoresAsRecord(filter?: {
    projectId?: string;
  }): Record<string, number>;

  /**
   * Read the buffered anomalies as per-code entries. Drives the tRPC
   * `supervisor.getSentinelRiskScores` query surface.
   */
  getSentinelRiskScoresPerCode(filter?: {
    projectId?: string;
  }): ReadonlyArray<SentinelCompositeEntry>;
}

/**
 * Thrown by `observe` on an unknown discriminant. Per `feedback_no_heuristic_bandaids.md`
 * — do NOT silently swallow unknown observation types; a contract mismatch is a
 * caller-side bug and must surface at runtime.
 */
export class SentinelContractDefectError extends Error {
  constructor(unknownType: string) {
    super(
      `SentinelModule.observe received unknown observation type '${unknownType}'. ` +
        'Extend SentinelObservationIngress discriminated union to resolve.',
    );
    this.name = 'SentinelContractDefectError';
  }
}

/** Internal timestamp parser that returns ms since epoch. */
function parseIsoToMs(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid ISO-8601 timestamp: '${iso}'`);
  }
  return ms;
}

/**
 * Factory for `SentinelModule`. Closure-scoped internal state:
 * - `perAgentRetryDeque` — time-windowed deque for SUP-009.
 * - `perAgentEscalationDeque` — time-windowed deque for SUP-010.
 * - `perAgentLastActivity` — last-activity ms for SUP-011.
 * - `perRunToolCallCounters` — SUP-012 ratio counters.
 * - `perAgentIdleMarker` — SUP-011 fire-suppression.
 */
export function createSentinelModule(deps: SentinelDeps): SentinelModule {
  const perAgentRetryDeque = new Map<string, number[]>();
  const perAgentEscalationDeque = new Map<string, number[]>();
  const perAgentLastActivity = new Map<
    string,
    { ms: number; agentClass: string; projectId: string; runId: string }
  >();
  const perRunToolCallCounters = new Map<
    string,
    {
      unknown: number;
      total: number;
      agentId: string;
      agentClass: string;
      projectId: string;
    }
  >();
  const perAgentIdleMarker = new Map<string, number>();

  /** Trim entries older than `(nowMs - windowMs)` from the front of a deque. */
  function trimWindow(deque: number[], nowMs: number, windowMs: number): void {
    const cutoff = nowMs - windowMs;
    while (deque.length > 0 && deque[0]! < cutoff) {
      deque.shift();
    }
  }

  function observe(
    obs: SentinelObservationIngress,
  ): SentinelClassificationResult | null {
    switch (obs.type) {
      case 'outbox-retry': {
        const nowMs = parseIsoToMs(obs.at);
        const windowMs = deps.thresholds.retryWindowSeconds * 1000;
        const deque = perAgentRetryDeque.get(obs.agentId) ?? [];
        deque.push(nowMs);
        trimWindow(deque, nowMs, windowMs);
        perAgentRetryDeque.set(obs.agentId, deque);
        const count = deque.length;
        if (count > deps.thresholds.retryCountPerWindow) {
          return {
            sup_code: 'SUP-009',
            agent_id: obs.agentId,
            agent_class: obs.agentClass,
            project_id: obs.projectId,
            run_id: obs.runId,
            risk_score: Math.min(count / deps.thresholds.retryCountPerWindow, 1),
            explanation:
              `agent_id=${obs.agentId} retry count ${count} > threshold ${deps.thresholds.retryCountPerWindow} ` +
              `within ${deps.thresholds.retryWindowSeconds}s`,
            classified_at: obs.at,
          };
        }
        return null;
      }
      case 'outbox-escalation': {
        const nowMs = parseIsoToMs(obs.at);
        const windowMs = deps.thresholds.escalationWindowSeconds * 1000;
        const deque = perAgentEscalationDeque.get(obs.agentId) ?? [];
        deque.push(nowMs);
        trimWindow(deque, nowMs, windowMs);
        perAgentEscalationDeque.set(obs.agentId, deque);
        const count = deque.length;
        if (count > deps.thresholds.escalationCountPerWindow) {
          return {
            sup_code: 'SUP-010',
            agent_id: obs.agentId,
            agent_class: obs.agentClass,
            project_id: obs.projectId,
            run_id: obs.runId,
            risk_score: Math.min(
              count / deps.thresholds.escalationCountPerWindow,
              1,
            ),
            explanation:
              `agent_id=${obs.agentId} escalation count ${count} > threshold ${deps.thresholds.escalationCountPerWindow} ` +
              `within ${deps.thresholds.escalationWindowSeconds}s`,
            classified_at: obs.at,
          };
        }
        return null;
      }
      case 'health-sink-activity': {
        // Reset the idle clock; clear the idle fire-suppression marker if
        // activity has resumed strictly after the last marker timestamp.
        const activityMs = parseIsoToMs(obs.at);
        perAgentLastActivity.set(obs.agentId, {
          ms: activityMs,
          agentClass: obs.agentClass,
          projectId: obs.projectId,
          runId: obs.runId,
        });
        const markerMs = perAgentIdleMarker.get(obs.agentId);
        if (markerMs !== undefined && activityMs > markerMs) {
          perAgentIdleMarker.delete(obs.agentId);
        }
        // SUP-011 is fired from `sweepIdleAgents()` (heartbeat-driven), not
        // from `observe` — this variant is a no-op that updates state.
        return null;
      }
      case 'tool-call': {
        const counter = perRunToolCallCounters.get(obs.runId) ?? {
          unknown: 0,
          total: 0,
          agentId: obs.agentId,
          agentClass: obs.agentClass,
          projectId: obs.projectId,
        };
        counter.total += 1;
        if (
          obs.expectedToolSurface !== undefined &&
          !obs.expectedToolSurface.has(obs.toolName)
        ) {
          counter.unknown += 1;
        }
        perRunToolCallCounters.set(obs.runId, counter);
        const ratio = counter.total > 0 ? counter.unknown / counter.total : 0;
        if (ratio > 0) {
          return {
            sup_code: 'SUP-012',
            agent_id: obs.agentId,
            agent_class: obs.agentClass,
            project_id: obs.projectId,
            run_id: obs.runId,
            risk_score: ratio,
            explanation:
              `run_id=${obs.runId} unknown-tool ratio ${counter.unknown}/${counter.total} = ${ratio.toFixed(3)}`,
            classified_at: obs.at,
          };
        }
        return null;
      }
      default: {
        const exhaustive: never = obs;
        throw new SentinelContractDefectError(
          (exhaustive as { type?: string }).type ?? 'undefined',
        );
      }
    }
  }

  function sweepIdleAgents(): SentinelClassificationResult[] {
    const nowIso = deps.getNow();
    const nowMs = parseIsoToMs(nowIso);
    const thresholdMs = deps.thresholds.stalledAgentIdleSeconds * 1000;
    const classifications: SentinelClassificationResult[] = [];
    for (const [agentId, state] of perAgentLastActivity) {
      const elapsedMs = nowMs - state.ms;
      if (elapsedMs <= thresholdMs) continue;
      // Fire-suppression — only fire once per idle window (until activity
      // resumes and clears the marker in `observe('health-sink-activity')`).
      const markerMs = perAgentIdleMarker.get(agentId);
      if (markerMs !== undefined && markerMs >= state.ms) continue;
      perAgentIdleMarker.set(agentId, nowMs);
      const elapsedSeconds = elapsedMs / 1000;
      const excess =
        (elapsedSeconds - deps.thresholds.stalledAgentIdleSeconds) /
        deps.thresholds.stalledAgentIdleSeconds;
      classifications.push({
        sup_code: 'SUP-011',
        agent_id: agentId,
        agent_class: state.agentClass,
        project_id: state.projectId,
        run_id: state.runId,
        risk_score: Math.min(Math.max(excess, 0), 1),
        explanation:
          `agent_id=${agentId} idle ${Math.round(elapsedSeconds)}s > threshold ${deps.thresholds.stalledAgentIdleSeconds}s`,
        classified_at: nowIso,
      });
    }
    return classifications;
  }

  async function dispatchClassification(
    c: SentinelClassificationResult,
  ): Promise<void> {
    // (i) Ring-buffer push.
    const record: SupervisorAnomalyRecord = {
      classification: c,
      severity: 'S3',
      buffered_at: deps.getNow(),
      ...(c.sup_code === 'SUP-011'
        ? {
            idle_window_marker: {
              threshold_seconds: deps.thresholds.stalledAgentIdleSeconds,
              last_activity_at: c.classified_at,
            },
          }
        : {}),
    };
    deps.anomalyBuffer.push(record);

    // (ii) EventBus publish.
    const payload: SupervisorAnomalyClassifiedPayload = {
      sup_code: c.sup_code,
      risk_score: c.risk_score,
      explanation: c.explanation,
      agent_id: c.agent_id,
      agent_class: c.agent_class,
      run_id: c.run_id,
      project_id: c.project_id,
      triggering_event_refs: [],
      classified_at: c.classified_at,
    };
    try {
      await deps.eventBus.publish('supervisor:anomaly-classified', payload);
    } catch (err) {
      deps.logger?.warn?.('supervisor.sentinel_eventbus_failed', {
        sup_code: c.sup_code,
        err: err instanceof Error ? err.message : String(err),
      });
      deps.metric?.('supervisor_sentinel_anomaly_emit_failed_total', {
        sup_code: c.sup_code,
      });
    }

    // (iii) Witness emit (supervisor-detection S3 flavour).
    try {
      await deps.emitWitness({
        severity: 'S3',
        sup_code: c.sup_code,
        agent_id: c.agent_id,
        agent_class: c.agent_class,
        project_id: c.project_id,
        run_id: c.run_id,
        classified_at: c.classified_at,
        risk_score: c.risk_score,
        evidence_refs: [],
        explanation: c.explanation,
      });
    } catch (err) {
      deps.logger?.error?.('supervisor.sentinel_witness_failed', {
        sup_code: c.sup_code,
        err: err instanceof Error ? err.message : String(err),
      });
      deps.metric?.('supervisor_sentinel_witness_emit_failed_total', {
        sup_code: c.sup_code,
      });
    }

    deps.metric?.('supervisor_sentinel_anomalies_classified_total', {
      sup_code: c.sup_code,
    });
  }

  function getSentinelRiskScoresPerCode(filter?: {
    projectId?: string;
  }): ReadonlyArray<SentinelCompositeEntry> {
    const snapshot = deps.anomalyBuffer.snapshot();
    const byProject = new Map<
      string,
      SupervisorAnomalyRecord[]
    >();
    for (const row of snapshot) {
      if (
        filter?.projectId !== undefined &&
        row.classification.project_id !== filter.projectId
      )
        continue;
      const list = byProject.get(row.classification.project_id) ?? [];
      list.push(row);
      byProject.set(row.classification.project_id, list);
    }
    const result: SentinelCompositeEntry[] = [];
    const reportedAt = deps.getNow();
    for (const [projectId, rows] of byProject) {
      const maxRisk = rows.reduce(
        (m, r) => Math.max(m, r.classification.risk_score),
        0,
      );
      result.push({
        projectId,
        compositeRiskScore: maxRisk,
        activeAnomalies: rows.map((r) => ({
          supCode: r.classification.sup_code,
          riskScore: r.classification.risk_score,
          explanation: r.classification.explanation,
          agentId: r.classification.agent_id,
          classifiedAt: r.classification.classified_at,
        })),
        reportedAt,
      });
    }
    return result;
  }

  function getCompositeRiskScores(filter?: {
    projectId?: string;
  }): ReadonlyArray<SentinelCompositeEntry> {
    // Same computation as `getSentinelRiskScoresPerCode` — the two methods
    // are shape-identical in V1 (per-project composite with active anomalies
    // breakdown). Post-V1 they may diverge (e.g., per-code hot-tier view).
    return getSentinelRiskScoresPerCode(filter);
  }

  function getCompositeRiskScoresAsRecord(filter?: {
    projectId?: string;
  }): Record<string, number> {
    const entries = getCompositeRiskScores(filter);
    return Object.fromEntries(
      entries.map((e) => [e.projectId, e.compositeRiskScore]),
    );
  }

  return {
    observe,
    sweepIdleAgents,
    dispatchClassification,
    getCompositeRiskScores,
    getCompositeRiskScoresAsRecord,
    getSentinelRiskScoresPerCode,
  };
}

/**
 * Convenience binding: build a `SentinelWitnessArgs → Promise<void>` emitter
 * that calls `witnessService.appendInvariant` with the S3 detection shape.
 * Used by the bootstrap to wire `SentinelDeps.emitWitness`.
 */
export function createSentinelWitnessEmitter(
  witnessService: IWitnessService,
): (args: SentinelWitnessArgs) => Promise<void> {
  return async (args: SentinelWitnessArgs): Promise<void> => {
    await witnessService.appendInvariant({
      code: args.sup_code as never,
      actionCategory: 'supervisor-detection',
      actionRef: `${args.sup_code}-${args.run_id}`,
      actor: 'supervisor',
      detail: {
        severity: args.severity,
        agentId: args.agent_id,
        agentClass: args.agent_class,
        runId: args.run_id,
        projectId: args.project_id,
        reason: args.explanation,
        riskScore: args.risk_score,
        evidenceRefs: [...args.evidence_refs],
      },
      occurredAt: args.classified_at,
    });
  };
}
