/**
 * SupervisorOutboxSink — composite-outbox sink that records every gateway
 * outbox event as a `SupervisorObservation` on the supervisor service's
 * anomaly buffer.
 *
 * WR-162 SP 3 — `.architecture/.decisions/2026-03-23-kernel-safety/supervisor-observation-contract-v1.md`
 * (OBS-001..005). No classification here; SP 4 adds detectors that read
 * the anomaly buffer downstream.
 *
 * WR-162 SP 4 — SDS § Boundaries § `SupervisorOutboxSink` — first-class SP-4
 * boundary. The sink is the populator for every enrichment field detectors
 * consume (SUPV-SP4-003). Derivation rules:
 *   - `runId` ← `event.correlation.runId` (present on both outbox event
 *     variants).
 *   - `agentId`, `agentClass`, `projectId`, `traceId` ← derived from
 *     `GatewayRunSnapshotRegistry.get(runId)` when registered. `null`
 *     otherwise (sink logs at warn via injected logger).
 *   - `toolCall` ← narrowed from a `GatewayObservationEvent` whose
 *     `observation.observationType === 'tool_call'` and whose `detail.name`
 *     is a non-empty string. Outside that narrow shape, `toolCall` stays
 *     `null` (contract-grounded; SP 4 does not invent heuristics).
 *   - `routingTarget`, `lifecycleTransition`, `actionClaim` ← `null` today.
 *     These fields are reserved for future outbox event variants; detectors
 *     treat `null` as contract-grounded no-fire per
 *     `feedback_no_heuristic_bandaids.md`.
 *
 * OBS-003: `emit` is sub-millisecond, no I/O, no external awaits. Populator
 * failures (registry throws / bad shape) are caught and isolated; the
 * observation still delivers with affected fields left `null`.
 */
import type {
  GatewayOutboxEvent,
  GatewayToolCall,
  IGatewayOutboxSink,
  ILogChannel,
  SupervisorObservation,
} from '@nous/shared';
import type { GatewayRunSnapshotRegistry } from './gateway-run-registry.js';
import type { SupervisorService } from './supervisor-service.js';

export interface SupervisorOutboxSinkDeps {
  readonly service: SupervisorService;
  readonly now?: () => string;
  readonly gatewayRunSnapshotRegistry?: GatewayRunSnapshotRegistry;
  readonly logger?: ILogChannel;
}

export class SupervisorOutboxSink implements IGatewayOutboxSink {
  private readonly service: SupervisorService;
  private readonly now: () => string;
  private readonly registry: GatewayRunSnapshotRegistry | null;
  private readonly logger?: ILogChannel;

  // WR-162 SP 4 — SupervisorOutboxSinkDeps introduces `gatewayRunSnapshotRegistry`
  // as an optional construction-time dep. Overload preserves the SP 3
  // positional constructor signature so existing callers still compile.
  constructor(
    serviceOrDeps: SupervisorService | SupervisorOutboxSinkDeps,
    now?: () => string,
  ) {
    if (serviceOrDeps instanceof Object && 'service' in serviceOrDeps) {
      this.service = serviceOrDeps.service;
      this.now = serviceOrDeps.now ?? (() => new Date().toISOString());
      this.registry = serviceOrDeps.gatewayRunSnapshotRegistry ?? null;
      this.logger = serviceOrDeps.logger;
    } else {
      this.service = serviceOrDeps;
      this.now = now ?? (() => new Date().toISOString());
      this.registry = null;
      this.logger = undefined;
    }
  }

  async emit(event: GatewayOutboxEvent): Promise<void> {
    const observation = this.buildObservation(event);
    this.service.recordObservation(observation);
  }

  private buildObservation(event: GatewayOutboxEvent): SupervisorObservation {
    const base: SupervisorObservation = {
      observedAt: this.now(),
      source: 'gateway_outbox',
      payload: event,
      agentId: null,
      agentClass: null,
      runId: event.correlation.runId,
      projectId: null,
      traceId: null,
      toolCall: null,
      routingTarget: null,
      lifecycleTransition: null,
      actionClaim: null,
    };
    if (this.registry !== null) {
      try {
        const snapshot = this.registry.get(event.correlation.runId);
        if (snapshot !== null) {
          base.agentId = snapshot.agentId;
          base.agentClass = snapshot.agentClass;
          base.projectId = snapshot.execution?.projectId ?? null;
          base.traceId = snapshot.execution?.traceId ?? null;
        }
      } catch (error) {
        this.logger?.warn?.('supervisor.outbox_populator_failed', {
          observationSource: base.source,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }
    base.toolCall = extractToolCall(event);
    return base;
  }
}

function extractToolCall(event: GatewayOutboxEvent): GatewayToolCall | null {
  if (event.type !== 'observation') return null;
  const obs = event.observation;
  if (obs.observationType !== 'tool_call') return null;
  const name = (obs.detail as Record<string, unknown>).name;
  if (typeof name !== 'string' || name.length === 0) return null;
  const params = (obs.detail as Record<string, unknown>).params;
  return { name, params };
}
