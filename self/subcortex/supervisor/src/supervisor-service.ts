/**
 * SupervisorService — Phase-C extension of the SP 3 skeleton.
 *
 * WR-162 SP 4 — adds `runClassifier`, `onEnforcementDispatch` stub, and
 * witness / EventBus dep plumbing. SP 3's construct-but-no-op contract is
 * preserved: when `appConfig.supervisor.enabled === false`, `runClassifier`
 * is an early-return — no classify, no buffer push, no bus publish, no
 * witness write, no enforcement dispatch (SUPV-SP4-001).
 *
 * SP 4 invariants honoured here:
 * - SUPV-SP4-001 — single-source-of-truth enabled gate at top of
 *   `runClassifier`; also blocks `recordObservation` from invoking classify.
 * - SUPV-SP4-003 (revised) — Identity-Completeness Gate drops observations
 *   missing any of `agentId`/`agentClass`/`runId`/`projectId`; no detector
 *   is invoked, no record produced, no witness event written.
 * - SUPV-SP4-005 — synchronous-classify-per-observation topology; classify
 *   is fire-and-forget off `recordObservation` so the outbox hot path
 *   (OBS-003) remains O(1) synchronous push.
 * - SUPV-SP4-007 — witness event payload includes `severity`, `agentId`,
 *   `agentClass`, `runId`, `projectId`, `supervisorActor: 'supervisor'`,
 *   `reason`, `evidenceFromDetector`; `actionRef: ${supCode}-${runId}`.
 * - SUPV-SP4-009 — `onEnforcementDispatch` default is a `logger.debug(...)`
 *   stub; SP 5 swaps in the real `OpctlService.submitCommand` callback.
 * - SUPV-SP4-010 — `emitEnforcementWitness` NOT called from production.
 */
import { z } from 'zod';
import {
  SUPERVISOR_INVARIANT_SEVERITY_MAP,
  SupervisorObservationSchema,
  SupervisorViolationRecordSchema,
  type GuardrailStatus,
  type IEventBus,
  type ILogChannel,
  type ISupervisorHandle,
  type ISupervisorService,
  type IWitnessService,
  type SentinelRiskScore,
  type SupervisorConfig,
  type SupervisorEnforcementAction,
  type SupervisorObservation,
  type SupervisorStatusSnapshot,
  type SupervisorViolationRecord,
  type SupervisorViolationDetectedPayload,
  type WitnessIntegrityStatus,
} from '@nous/shared';
import { setInterval as nodeSetInterval, clearInterval as nodeClearInterval } from 'node:timers';
import { RingBuffer } from './ring-buffer.js';
import { classify } from './classifier.js';
import {
  createDetectorContextFactory,
  type DetectorContextFactory,
  type DetectorContextFactoryDeps,
} from './detector-context.js';
import type { AgentClassToolSurfaceRegistry } from './agent-class-tool-surface.js';
import type { BudgetReadonlyView } from './detection/types.js';
import { emitDetectionWitness } from './witness-emission.js';
import type { EnforcementDeps, EnforcementResult } from './enforcement.js';
import type {
  SentinelClassificationResult,
  SentinelModule,
  SentinelObservationIngress,
  SupervisorAnomalyRecord,
} from './sentinel.js';

/**
 * WR-162 SP 5 — `SupervisorServiceDeps.enforcement` slot shape.
 * Additive and optional; SP 4 baseline tests construct `SupervisorService`
 * without this slot and continue to hit the `onEnforcementDispatch`
 * log-stub fallback. SP 5 production (bootstrap) supplies both.
 */
export interface SupervisorEnforcementSlot {
  readonly enforce: (
    violation: SupervisorViolationRecord,
    deps: EnforcementDeps,
  ) => Promise<EnforcementResult>;
  readonly deps: EnforcementDeps;
}

/** Default ring-buffer capacity when `config.maxObservationQueueDepth` is absent. */
const DEFAULT_MAX_DEPTH = 1024;

/**
 * Metric-counter hook. The bootstrap layer may inject a counter recorder
 * (e.g., Prometheus `counter.inc(label)`); default is a no-op.
 */
export type SupervisorMetricCounter = (name: string, labels: Readonly<Record<string, string>>) => void;

export interface SupervisorServiceDeps {
  /** Injectable clock — defaults to `() => new Date().toISOString()`. */
  now?: () => string;
  /**
   * Static construction-time config. Ring-buffer capacity is read at
   * construction from `config.maxObservationQueueDepth`. The
   * `config.enabled` field is the single-source-of-truth detector gate
   * (SUPV-SP4-001) — read once at construction and immutable for the
   * lifetime of the instance.
   */
  config?: SupervisorConfig;
  /** Optional structured log channel for diagnostic output. */
  log?: ILogChannel;
  /** WR-162 SP 4 — required for detection witness writes. */
  witnessService?: IWitnessService;
  /** WR-162 SP 4 — optional EventBus for `supervisor:violation-detected` emits. */
  eventBus?: IEventBus;
  /**
   * WR-162 SP 4 — enforcement dispatch callback (SUPV-SP4-009). Default is
   * a debug log. SP 5 threads the real `OpctlService.submitCommand` caller.
   */
  onEnforcementDispatch?: (
    violation: SupervisorViolationRecord,
    action: SupervisorEnforcementAction,
  ) => void;
  /**
   * Optional detector-context factory override. Default builds a factory
   * from `witnessService` + optional `toolSurfaceRegistry`/`getBudgetView`.
   */
  detectorContextFactory?: DetectorContextFactory;
  /** Tool-surface registry override (SUP-003). Default is the V1 seed. */
  toolSurfaceRegistry?: AgentClassToolSurfaceRegistry;
  /** Per-run budget-view accessor (SUP-005/SUP-006). Default: returns null. */
  getBudgetView?: (runId: string | null) => BudgetReadonlyView | null;
  /** Read-only ledger event accessor backing `hasAuthorizationForAction`. */
  readEventsForAuthorization?: DetectorContextFactoryDeps['readEventsForAuthorization'];
  /** Metric counter hook — default is a no-op. */
  metric?: SupervisorMetricCounter;
  /**
   * WR-162 SP 5 — production enforcement slot (SUPV-SP5-005).
   *
   * When provided, `processRecord` routes via
   * `await deps.enforcement.enforce(finalized, deps.enforcement.deps)`
   * instead of the SP 4 log-stub `onEnforcementDispatch`. Errors thrown
   * by `enforce` are caught in `processRecord` and surfaced via metric
   * + log (`supervisor_enforcement_threw_total`) without propagating
   * to the outer classify loop.
   *
   * When absent (SP 4 baseline), `onEnforcementDispatch` remains the
   * enforcement path so pre-existing tests continue to pass.
   */
  enforcement?: SupervisorEnforcementSlot;
  /**
   * WR-162 SP 6 — sentinel slot (SUPV-SP6-003 / SUPV-SP6-013).
   *
   * When provided, `startSupervision` allocates a heartbeat interval that
   * publishes `supervisor:sentinel-status`, and `runClassifier` feeds
   * sentinel-known observations into `module.observe(...)` then dispatches
   * classifications via `module.dispatchClassification(...)`.
   *
   * When absent (SP 3/4/5 baseline), heartbeat is never allocated, sentinel
   * observations are not fed, and the read methods return contract-grounded
   * empty state. Construction-presence IS the gate — no second `if (enabled)`
   * check inside callback / dispatch / query bodies.
   */
  sentinel?: {
    readonly module: SentinelModule;
    readonly heartbeatIntervalMs: number;
    readonly anomalyBuffer: RingBuffer<SupervisorAnomalyRecord>;
  };
}

type IdentityNullReason =
  | 'agent_id_null'
  | 'agent_class_null'
  | 'run_id_null'
  | 'project_id_null';

function firstNullIdentityField(
  observation: SupervisorObservation,
): IdentityNullReason | null {
  if (observation.agentId === null) return 'agent_id_null';
  if (observation.agentClass === null) return 'agent_class_null';
  if (observation.runId === null) return 'run_id_null';
  if (observation.projectId === null) return 'project_id_null';
  return null;
}

export class SupervisorService implements ISupervisorService {
  private active = false;
  private handle: ISupervisorHandle | null = null;
  private readonly now: () => string;
  private readonly violationBuffer: RingBuffer<SupervisorViolationRecord>;
  private readonly anomalyBuffer: RingBuffer<SupervisorObservation>;
  private readonly supervisorEnabled: boolean;
  private readonly log?: ILogChannel;
  private readonly witnessService?: IWitnessService;
  private readonly eventBus?: IEventBus;
  private readonly onEnforcementDispatch: (
    violation: SupervisorViolationRecord,
    action: SupervisorEnforcementAction,
  ) => void;
  private readonly detectorContextFactory: DetectorContextFactory | null;
  private readonly metric: SupervisorMetricCounter;
  private readonly sup006DedupSeen = new Set<string>();
  // WR-162 SP 5 — production enforcement slot (SUPV-SP5-005). Null when
  // unset; `processRecord` falls back to `onEnforcementDispatch`.
  private readonly enforcement: SupervisorEnforcementSlot | null;
  // WR-162 SP 6 — sentinel slot + heartbeat state + instance counters +
  // activeAgentTracker. Construction-presence IS the gate (SUPV-SP6-013).
  private readonly sentinelSlot: SupervisorServiceDeps['sentinel'] | undefined;
  private heartbeatHandle: ReturnType<typeof setInterval> | null = null;
  private readonly activeAgentTracker = new Map<string, number>();
  private readonly lifetime: {
    violationsDetected: number;
    anomaliesClassified: number;
    enforcementsApplied: number;
  } = {
    violationsDetected: 0,
    anomaliesClassified: 0,
    enforcementsApplied: 0,
  };
  private witnessIntegritySignal: WitnessIntegrityStatus | undefined;

  constructor(private readonly deps: SupervisorServiceDeps = {}) {
    this.now = deps.now ?? (() => new Date().toISOString());
    const maxDepth =
      deps.config?.maxObservationQueueDepth ?? DEFAULT_MAX_DEPTH;
    this.violationBuffer = new RingBuffer(maxDepth);
    this.anomalyBuffer = new RingBuffer(maxDepth);
    this.supervisorEnabled = deps.config?.enabled ?? true;
    this.log = deps.log;
    this.witnessService = deps.witnessService;
    this.eventBus = deps.eventBus;
    this.onEnforcementDispatch =
      deps.onEnforcementDispatch ??
      ((violation, action): void => {
        deps.log?.debug?.('supervisor.dispatch_to_enforcement', {
          supCode: violation.supCode,
          severity: violation.severity,
          action,
          runId: violation.runId,
          agentId: violation.agentId,
        });
      });
    this.metric = deps.metric ?? ((): void => undefined);
    this.enforcement = deps.enforcement ?? null;
    // WR-162 SP 6 — sentinel slot stored at construction; no runtime mutation.
    this.sentinelSlot = deps.sentinel;
    // Build the default detector context factory when overrides aren't
    // provided AND witnessService is available. When neither is available,
    // runClassifier is disabled regardless of `supervisorEnabled` (the
    // SUPV-SP4-001 gate already blocks the path; this is defense-in-depth).
    if (deps.detectorContextFactory !== undefined) {
      this.detectorContextFactory = deps.detectorContextFactory;
    } else if (deps.witnessService !== undefined) {
      this.detectorContextFactory = createDetectorContextFactory({
        witnessService: deps.witnessService,
        toolSurfaceRegistry: deps.toolSurfaceRegistry,
        getBudgetView: deps.getBudgetView,
        readEventsForAuthorization: deps.readEventsForAuthorization,
        now: this.now,
        logger: deps.log,
      });
    } else {
      this.detectorContextFactory = null;
    }
  }

  // --- Lifecycle ---

  startSupervision(config: SupervisorConfig): ISupervisorHandle {
    // SUPV-SP3-001: idempotent — second call returns the same handle.
    if (this.handle !== null) {
      return this.handle;
    }

    const enabled = config.enabled ?? true;
    if (!enabled) {
      // SUPV-SP3-002: construct-but-no-op. Inert handle; service stays inactive.
      this.active = false;
      this.handle = {
        stop: async () => {
          // No-op for the inert handle; pre-flushed.
        },
        isActive: () => false,
      };
      return this.handle;
    }

    this.active = true;
    // WR-162 SP 6 (SUPV-SP6-003) — heartbeat-allocate branch. Construction-
    // presence check on `sentinelSlot` replaces a second `if (enabled)` check;
    // when `enabled: false` above returned early, this code is unreachable
    // (single-gate invariant SUPV-SP6-013).
    if (this.sentinelSlot !== undefined && this.heartbeatHandle === null) {
      this.heartbeatHandle = nodeSetInterval(() => {
        void this.heartbeatTick();
      }, this.sentinelSlot.heartbeatIntervalMs);
    }
    this.handle = {
      stop: async () => {
        await this.stopSupervision();
      },
      isActive: () => this.active,
    };
    return this.handle;
  }

  async stopSupervision(): Promise<void> {
    this.active = false;
    // WR-162 SP 6 (SUPV-SP6-003) — idempotent heartbeat teardown; repeated
    // calls see null and skip clearInterval(null).
    if (this.heartbeatHandle !== null) {
      nodeClearInterval(this.heartbeatHandle);
      this.heartbeatHandle = null;
    }
    this.violationBuffer.clear();
    this.anomalyBuffer.clear();
    this.sup006DedupSeen.clear();
  }

  /**
   * WR-162 SP 6 (SUPV-SP6-003, SUPV-SP6-004, SUPV-SP6-016) — heartbeat tick.
   *
   * Order of operations:
   *  (i)   Sweep idle agents and dispatch any SUP-011 classifications (uses
   *        the same three-step dispatch as observe-driven classifications).
   *  (ii)  Build the camelCase domain `SupervisorStatusSnapshot` via
   *        `getStatusSnapshot()` — intentionally NOT wrapped in try/catch
   *        (snapshot defects surface as contract-level bugs).
   *  (iii) Project to the snake_case wire `SupervisorSentinelStatusPayload`
   *        per SUPV-SP6-016 mapping table.
   *  (iv)  Publish on EventBus inside a try/catch (error-contained; loop
   *        survives EventBus backpressure / serialization transients).
   *  (v)   SUP-007 periodic fan-out — SUPV-SP6-017 two-branch posture. At
   *        code-start the `GatewayRunSnapshotRegistry.listAll()` accessor
   *        was confirmed NOT available (SP 4 registry surface lacks it per
   *        `self/subcortex/supervisor/src/gateway-run-registry.ts`
   *        inspection — no `listAll` method). Deferral preserved. No
   *        heuristic scan substitute (`feedback_no_heuristic_bandaids.md`).
   */
  private async heartbeatTick(): Promise<void> {
    if (this.sentinelSlot === undefined) return;
    // (i) SUP-011 idle sweep.
    try {
      const idleClassifications = this.sentinelSlot.module.sweepIdleAgents();
      for (const c of idleClassifications) {
        await this.sentinelSlot.module.dispatchClassification(c);
        this.lifetime.anomaliesClassified += 1;
      }
    } catch (err) {
      this.log?.warn?.('supervisor.sentinel_sweep_failed', {
        err: err instanceof Error ? err.message : String(err),
      });
    }

    if (this.eventBus === undefined) return;

    // (ii) snapshot build — NOT wrapped; contract-level defects surface.
    const snapshot = await this.getStatusSnapshot();

    // (iii) camelCase domain → snake_case wire projection per SUPV-SP6-016.
    const wirePayload = {
      active: snapshot.active,
      agents_monitored: snapshot.agentsMonitored,
      violations_detected: snapshot.lifetime.violationsDetected,
      anomalies_classified: snapshot.lifetime.anomaliesClassified,
      risk_summary: snapshot.riskSummary,
      reported_at: snapshot.reportedAt,
    };

    // (iv) EventBus publish — error-contained.
    try {
      await this.eventBus.publish('supervisor:sentinel-status', wirePayload);
    } catch (err) {
      this.log?.error?.('supervisor.sentinel_heartbeat_emit_failed', {
        err: err instanceof Error ? err.message : String(err),
      });
      this.metric('supervisor_sentinel_heartbeat_emit_failed_total', {});
    }

    // (v) SUP-007 periodic fan-out — SUPV-SP6-017 branch (b): deferred.
    // No-op until `GatewayRunSnapshotRegistry.listAll()` lands in a future
    // phase. Do NOT substitute a heuristic scan of an unrelated surface.
  }

  /** WR-162 SP 6 (SUPV-SP6-012) — private helper for status snapshot. */
  private bucketViolationsBySeverity(
    rows: readonly SupervisorViolationRecord[],
  ): { s0: number; s1: number; s2: number; s3: number } {
    const counts = { s0: 0, s1: 0, s2: 0, s3: 0 };
    for (const row of rows) {
      const key = row.severity.toLowerCase() as 's0' | 's1' | 's2' | 's3';
      if (key in counts) {
        counts[key] += 1;
      }
    }
    return counts;
  }

  /**
   * WR-162 SP 6 — test-only introspection hook for the heartbeat tick.
   * Invoking this bypasses the `setInterval` scheduler so unit tests can
   * exercise the tick body deterministically. Not part of `ISupervisorService`.
   */
  async __test_heartbeatTick(): Promise<void> {
    await this.heartbeatTick();
  }

  /** WR-162 SP 6 — test-only introspection: has the heartbeat interval been allocated? */
  __test_heartbeatHandleAllocated(): boolean {
    return this.heartbeatHandle !== null;
  }

  // --- Observation entry point (used by SupervisorOutboxSink) ---

  /**
   * Record a raw observation in the anomaly buffer. Dev-mode hot-path Zod
   * parse per SDS § Data Model — the observation envelope is small and the
   * parse is sub-millisecond.
   *
   * WR-162 SP 4 — after push, kicks off a fire-and-forget
   * `runClassifier(observation)`. The hot path (outbox→sink→recordObservation)
   * remains O(1) synchronous; the classify work is scheduled on the
   * microtask queue and the `.catch(...)` tail logs any surprise errors
   * without propagating (SUPV-SP4-005).
   */
  recordObservation(
    observation: z.input<typeof SupervisorObservationSchema>,
  ): void {
    const parsed: SupervisorObservation = SupervisorObservationSchema.parse(
      observation,
    );
    this.anomalyBuffer.push(parsed);
    // Fire-and-forget classify. SUPV-SP4-001 gate inside `runClassifier`
    // handles the disabled case; no outer null/enabled check needed here.
    this.runClassifier(parsed).catch((error) => {
      this.log?.warn?.('supervisor.classifier_threw', {
        observationSource: parsed.source,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    });
  }

  /**
   * Run the classifier on a single observation. Public so tests can
   * invoke it directly; production path is via `recordObservation`.
   */
  async runClassifier(observation: SupervisorObservation): Promise<void> {
    // SUPV-SP4-001 — single-source-of-truth gate.
    if (this.supervisorEnabled === false) {
      this.log?.debug?.('supervisor.run_classifier_skipped_disabled', {
        observationSource: observation.source,
        runId: observation.runId,
      });
      return;
    }
    // SUPV-SP4-003 revised — Identity-Completeness Gate.
    const nullReason = firstNullIdentityField(observation);
    if (nullReason !== null) {
      this.log?.debug?.('supervisor.observation_dropped_incomplete_identity', {
        observationSource: observation.source,
        nullField: nullReason,
      });
      this.metric('supervisor_observations_dropped_incomplete_identity_total', {
        reason: nullReason,
      });
      return;
    }
    // Defense-in-depth: if neither witnessService nor a factory override is
    // wired, runClassifier cannot emit detection witnesses — early return.
    if (this.witnessService === undefined) {
      this.log?.warn?.('supervisor.classifier_missing_witness_service', {
        observationSource: observation.source,
      });
      return;
    }
    if (this.detectorContextFactory === null) {
      this.log?.warn?.('supervisor.classifier_missing_context_factory', {
        observationSource: observation.source,
      });
      return;
    }
    // Build per-observation frozen context.
    const context = this.detectorContextFactory(observation);
    let records: SupervisorViolationRecord[] = [];
    try {
      records = await classify(observation, context, {
        onDetectorError: (detectorIndex, error) => {
          this.log?.warn?.('supervisor.detector_threw', {
            detectorIndex,
            errorMessage: error instanceof Error ? error.message : String(error),
            observationSource: observation.source,
          });
          this.metric('supervisor_detector_threw_total', {
            detector_index: String(detectorIndex),
          });
        },
      });
    } catch (error) {
      this.log?.error?.('supervisor.classifier_threw', {
        observationSource: observation.source,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    for (const record of records) {
      await this.processRecord(record);
    }
  }

  private async processRecord(
    record: SupervisorViolationRecord,
  ): Promise<void> {
    // SUP-006 dedup: first-fire-wins keyed on `supCode + runId`.
    if (record.supCode === 'SUP-006') {
      const key = `${record.supCode}::${record.runId}`;
      if (this.sup006DedupSeen.has(key)) {
        return;
      }
      this.sup006DedupSeen.add(key);
    }
    let witnessEventId: string | null = null;
    if (this.witnessService !== undefined) {
      try {
        witnessEventId = await emitDetectionWitness({
          violation: record,
          witnessService: this.witnessService,
        });
      } catch (error) {
        this.log?.error?.('supervisor.witness_append_failed', {
          supCode: record.supCode,
          severity: record.severity,
          runId: record.runId,
          agentId: record.agentId,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        this.metric('supervisor_witness_append_failed_total', {
          sup_code: record.supCode,
        });
        return;
      }
    }
    const evidenceRefs = witnessEventId !== null ? [witnessEventId] : [];
    const finalized: SupervisorViolationRecord = {
      ...record,
      evidenceRefs,
    };
    const parsed = SupervisorViolationRecordSchema.safeParse(finalized);
    if (!parsed.success) {
      this.log?.error?.('supervisor.record_schema_parse_failed', {
        supCode: record.supCode,
        zodIssues: parsed.error.issues.map((issue) => issue.message),
      });
      this.metric('supervisor_record_schema_parse_failed_total', {
        sup_code: record.supCode,
      });
      return;
    }
    this.violationBuffer.push(parsed.data);
    // WR-162 SP 6 (SUPV-SP6-012) — hot-path increment for status snapshot.
    this.lifetime.violationsDetected += 1;
    this.log?.debug?.('supervisor.detection_fired', {
      supCode: parsed.data.supCode,
      severity: parsed.data.severity,
      runId: parsed.data.runId,
      agentId: parsed.data.agentId,
      agentClass: parsed.data.agentClass,
      evidenceRefs: parsed.data.evidenceRefs,
    });
    this.metric('supervisor_violations_detected_total', {
      sup_code: parsed.data.supCode,
      severity: parsed.data.severity,
    });
    if (this.eventBus !== undefined) {
      const payload: SupervisorViolationDetectedPayload = {
        sup_code: parsed.data.supCode,
        severity: parsed.data.severity,
        agent_id: parsed.data.agentId,
        agent_class: parsed.data.agentClass,
        run_id: parsed.data.runId,
        project_id: parsed.data.projectId,
        evidence_refs: [...parsed.data.evidenceRefs],
        detected_at: parsed.data.detectedAt,
      };
      this.eventBus.publish('supervisor:violation-detected', payload);
    }
    const supervisorAction =
      SUPERVISOR_INVARIANT_SEVERITY_MAP[
        parsed.data.supCode as keyof typeof SUPERVISOR_INVARIANT_SEVERITY_MAP
      ]?.enforcement;
    // WR-162 SP 5 — SUPV-SP5-005 production routing. When the
    // enforcement slot is wired (bootstrap path), dispatch to the
    // real `enforce(...)` function fire-and-await. Errors are caught
    // here so the outer classify loop continues processing subsequent
    // records (no propagation). When the slot is absent (SP 4 baseline
    // test path), fall back to the log-stub `onEnforcementDispatch`.
    if (this.enforcement !== null) {
      try {
        const enforcementResult = await this.enforcement.enforce(
          parsed.data,
          this.enforcement.deps,
        );
        // WR-162 SP 6 (SUPV-SP6-012) — hot-path increment for status
        // snapshot. Count enforcement as applied only when the dispatch
        // reported a non-error terminal outcome.
        if (
          enforcementResult.status === 'applied' ||
          enforcementResult.status === 'conflict_resolved'
        ) {
          this.lifetime.enforcementsApplied += 1;
        }
      } catch (err) {
        this.log?.error?.('supervisor.enforcement_threw', {
          sup_code: parsed.data.supCode,
          severity: parsed.data.severity,
          err: err instanceof Error ? err.message : String(err),
        });
        this.metric('supervisor_enforcement_threw_total', {
          sup_code: parsed.data.supCode,
        });
      }
    } else if (supervisorAction !== undefined) {
      this.onEnforcementDispatch(parsed.data, supervisorAction);
    }
  }

  /**
   * WR-162 SP 6 — sentinel observation feed. Callers (outbox sink,
   * health-sink, tool-call tracker) feed observations here; sentinel
   * `observe` runs, and any classification is dispatched.
   *
   * The `sentinelSlot === undefined` check IS the single gate (SUPV-SP6-013);
   * when `supervisor.enabled: false` at bootstrap, the sentinel slot is never
   * constructed so observations are trivially no-op. No second config flag is
   * introduced.
   */
  async recordSentinelObservation(
    obs: SentinelObservationIngress,
  ): Promise<SentinelClassificationResult | null> {
    if (this.sentinelSlot === undefined) return null;
    // Update active-agent tracker for status snapshot.
    try {
      this.activeAgentTracker.set(obs.agentId, Date.parse(obs.at));
    } catch {
      // Ignore unparseable timestamps; observation is still fed through.
    }
    let classification: SentinelClassificationResult | null = null;
    try {
      classification = this.sentinelSlot.module.observe(obs);
    } catch (err) {
      this.log?.warn?.('supervisor.sentinel_observe_threw', {
        type: obs.type,
        err: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
    if (classification !== null) {
      await this.sentinelSlot.module.dispatchClassification(classification);
      this.lifetime.anomaliesClassified += 1;
    }
    return classification;
  }

  /** WR-162 SP 6 — optional consumer surface for SP 4 witness-integrity signal. */
  setWitnessIntegritySignal(signal: WitnessIntegrityStatus): void {
    this.witnessIntegritySignal = signal;
  }

  // --- Read procedures (WR-162 SP 6 — real bodies per SUPV-SP6-011/012/007) ---

  async getRecentViolations(input: {
    projectId?: string;
    limit?: number;
    since?: string;
  }): Promise<SupervisorViolationRecord[]> {
    // SUPV-SP6-011 — drain the SP 4 violationBuffer with projectId/since/limit
    // filters. Zod at the tRPC boundary enforces limit <= 200.
    let rows: SupervisorViolationRecord[] = this.violationBuffer.snapshot();
    if (input.projectId !== undefined) {
      const projectIdFilter = input.projectId;
      rows = rows.filter((r) => r.projectId === projectIdFilter);
    }
    if (input.since !== undefined) {
      const sinceMs = Date.parse(input.since);
      if (!Number.isNaN(sinceMs)) {
        rows = rows.filter((r) => Date.parse(r.detectedAt) >= sinceMs);
      }
    }
    const limit = input.limit ?? 50;
    return rows.slice(0, limit);
  }

  async getStatusSnapshot(): Promise<SupervisorStatusSnapshot> {
    // SUPV-SP6-012 — real field computation from live SP 3/4/5/6 state.
    const violationSnapshot = this.violationBuffer.snapshot();
    return {
      active: this.active,
      agentsMonitored: this.activeAgentTracker.size,
      activeViolationCounts: this.bucketViolationsBySeverity(violationSnapshot),
      lifetime: {
        violationsDetected: this.lifetime.violationsDetected,
        anomaliesClassified: this.lifetime.anomaliesClassified,
        enforcementsApplied: this.lifetime.enforcementsApplied,
      },
      witnessIntegrity: (this.witnessIntegritySignal ??
        'intact') satisfies WitnessIntegrityStatus,
      riskSummary:
        this.sentinelSlot?.module.getCompositeRiskScoresAsRecord() ?? {},
      reportedAt: this.now(),
    };
  }

  async getSentinelRiskScores(input: {
    projectId?: string;
  }): Promise<SentinelRiskScore[]> {
    if (this.sentinelSlot === undefined) return [];
    const entries = this.sentinelSlot.module.getSentinelRiskScoresPerCode({
      projectId: input.projectId,
    });
    // The sentinel module's `SentinelCompositeEntry` shape is already
    // compatible with the SP 1 `SentinelRiskScore` schema (landed at
    // `self/shared/src/types/supervisor.ts:87–101`: projectId +
    // compositeRiskScore + activeAnomalies[] + reportedAt). Zod will parse
    // at the tRPC boundary; the service returns the already-shaped entries.
    return entries.map((e) => ({
      projectId: e.projectId,
      compositeRiskScore: e.compositeRiskScore,
      activeAnomalies: e.activeAnomalies.map((a) => ({
        supCode: a.supCode as SentinelRiskScore['activeAnomalies'][number]['supCode'],
        riskScore: a.riskScore,
        explanation: a.explanation,
        agentId: a.agentId,
        classifiedAt: a.classifiedAt,
      })),
      reportedAt: e.reportedAt,
    }));
  }

  async getAgentSupervisorSnapshot(agentId: string): Promise<{
    guardrail_status: GuardrailStatus;
    witness_integrity_status: WitnessIntegrityStatus;
    sentinel_risk_score: number | null;
  }> {
    // WR-162 SP 6 (SUPV-SP6-005 + SUPV-SP6-007) — return shape preserved per
    // SP 1 ISupervisorService. When sentinel is wired, scan buffered
    // anomalies for entries matching this agent and return `max(risk_score)`.
    // `guardrail_status` and `witness_integrity_status` fall back to
    // contract-grounded healthy defaults ('clear' / 'intact') when SP 3/4
    // signals are absent (not placeholders per DNR-B3).
    let sentinelRisk: number | null = null;
    if (this.sentinelSlot !== undefined) {
      const entries = this.sentinelSlot.module.getSentinelRiskScoresPerCode();
      for (const entry of entries) {
        for (const anomaly of entry.activeAnomalies) {
          if (anomaly.agentId === agentId) {
            sentinelRisk =
              sentinelRisk === null
                ? anomaly.riskScore
                : Math.max(sentinelRisk, anomaly.riskScore);
          }
        }
      }
    }
    return {
      guardrail_status: 'clear',
      witness_integrity_status: this.witnessIntegritySignal ?? 'intact',
      sentinel_risk_score: sentinelRisk,
    };
  }

  /** Test-only introspection for `violationBuffer`. Not part of `ISupervisorService`. */
  getViolationBufferSnapshot(): readonly SupervisorViolationRecord[] {
    return this.violationBuffer.snapshot();
  }
}

/**
 * Thin factory for construction ergonomics at the composition root.
 * Prefer this over `new SupervisorService(...)` in bootstrap code so the
 * construction-site call stays uniform across packages.
 */
export function createSupervisorService(
  deps: SupervisorServiceDeps = {},
): SupervisorService {
  return new SupervisorService(deps);
}
