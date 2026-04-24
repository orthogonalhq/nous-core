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
    this.violationBuffer.clear();
    this.anomalyBuffer.clear();
    this.sup006DedupSeen.clear();
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
    if (supervisorAction !== undefined) {
      this.onEnforcementDispatch(parsed.data, supervisorAction);
    }
  }

  // --- Read procedures (Phase-B zero-state stubs) ---

  async getRecentViolations(_input: {
    projectId?: string;
    limit?: number;
    since?: string;
  }): Promise<SupervisorViolationRecord[]> {
    // SP 3 Phase-B: no classification pipeline yet; always empty.
    // SP 4 populates the ring buffer via `runClassifier`; a future
    // sub-phase will drain the buffer here (SP 6 tRPC surface).
    return this.violationBuffer.snapshot();
  }

  async getStatusSnapshot(): Promise<SupervisorStatusSnapshot> {
    return {
      active: this.active,
      agentsMonitored: 0,
      activeViolationCounts: { s0: 0, s1: 0, s2: 0, s3: 0 },
      lifetime: {
        violationsDetected: 0,
        anomaliesClassified: 0,
        enforcementsApplied: 0,
      },
      witnessIntegrity: 'intact' satisfies WitnessIntegrityStatus,
      riskSummary: {},
      reportedAt: this.now(),
    };
  }

  async getSentinelRiskScores(_input: {
    projectId?: string;
  }): Promise<SentinelRiskScore[]> {
    // SP 3 Phase-B: sentinel module not wired; always empty.
    return [];
  }

  async getAgentSupervisorSnapshot(_agentId: string): Promise<{
    guardrail_status: GuardrailStatus;
    witness_integrity_status: WitnessIntegrityStatus;
    sentinel_risk_score: number | null;
  }> {
    return {
      guardrail_status: 'clear',
      witness_integrity_status: 'intact',
      sentinel_risk_score: null,
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
