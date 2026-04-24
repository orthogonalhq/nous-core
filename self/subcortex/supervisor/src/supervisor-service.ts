/**
 * SupervisorService — Phase-B stub implementation of ISupervisorService.
 *
 * WR-162 SP 3 — `.architecture/.decisions/2026-03-23-kernel-safety/supervisor-topology-architecture-v1.md`
 * + SP 3 SDS § Data Model. Every method returns empty/zero-state snapshots
 * backed by in-memory ring buffers. Classification / enforcement /
 * sentinel-scoring land in SP 4+; this file only satisfies the surface.
 *
 * Invariants this file upholds:
 * - SUPV-SP3-001 — `startSupervision()` is idempotent: second call returns
 *   the same `ISupervisorHandle` reference; no side-effects (sinks, etc.)
 *   are re-registered.
 * - SUPV-SP3-002 — `enabled: false` disposition is "construct-but-no-op":
 *   the service instance exists, but `startSupervision({ enabled: false })`
 *   returns an inert handle (`isActive() === false`) and `this.active`
 *   stays `false`. SP 4 detectors key off the same `config.enabled` flag.
 * - Per-agent snapshot uses snake_case keys (matches the MaoAgentProjection
 *   field convention / SP1-INV-007); status snapshot uses camelCase
 *   (matches supervisor-trpc-procedure-set-v1.md).
 */
import {
  SupervisorObservationSchema,
  type GuardrailStatus,
  type ISupervisorHandle,
  type ISupervisorService,
  type ILogChannel,
  type SentinelRiskScore,
  type SupervisorConfig,
  type SupervisorObservation,
  type SupervisorStatusSnapshot,
  type SupervisorViolationRecord,
  type WitnessIntegrityStatus,
} from '@nous/shared';
import { RingBuffer } from './ring-buffer.js';

/** Default ring-buffer capacity when `config.maxObservationQueueDepth` is absent. */
const DEFAULT_MAX_DEPTH = 1024;

export interface SupervisorServiceDeps {
  /** Injectable clock — defaults to `() => new Date().toISOString()`. */
  now?: () => string;
  /**
   * Static construction-time config. Ring-buffer capacity is read at
   * construction from `config.maxObservationQueueDepth`. The per-call
   * `SupervisorConfig` passed to `startSupervision()` is independent.
   */
  config?: SupervisorConfig;
  /** Optional structured log channel for diagnostic output. */
  log?: ILogChannel;
}

export class SupervisorService implements ISupervisorService {
  private active = false;
  private handle: ISupervisorHandle | null = null;
  private readonly now: () => string;
  private readonly violationBuffer: RingBuffer<SupervisorViolationRecord>;
  private readonly anomalyBuffer: RingBuffer<SupervisorObservation>;

  constructor(private readonly deps: SupervisorServiceDeps = {}) {
    this.now = deps.now ?? (() => new Date().toISOString());
    const maxDepth =
      deps.config?.maxObservationQueueDepth ?? DEFAULT_MAX_DEPTH;
    this.violationBuffer = new RingBuffer(maxDepth);
    this.anomalyBuffer = new RingBuffer(maxDepth);
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
  }

  // --- Observation entry point (used by SupervisorOutboxSink) ---

  /**
   * Record a raw observation in the anomaly buffer. Dev-mode hot-path Zod
   * parse per SDS § Data Model — the observation envelope is small and the
   * parse is sub-millisecond; SP 4 adds a `skipValidation` flag if telemetry
   * flags a regression.
   */
  recordObservation(observation: SupervisorObservation): void {
    const parsed = SupervisorObservationSchema.parse(observation);
    this.anomalyBuffer.push(parsed);
  }

  // --- Read procedures (Phase-B zero-state stubs) ---

  async getRecentViolations(_input: {
    projectId?: string;
    limit?: number;
    since?: string;
  }): Promise<SupervisorViolationRecord[]> {
    // SP 3 Phase-B: no classification pipeline yet; always empty.
    return [];
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
    // SP 3 Phase-B zero-state. SP 6 flips the read (MAO projection), but
    // this return shape is authoritative today. `guardrail_status: 'clear'`,
    // `witness_integrity_status: 'intact'`, `sentinel_risk_score: null`.
    return {
      guardrail_status: 'clear',
      witness_integrity_status: 'intact',
      sentinel_risk_score: null,
    };
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
