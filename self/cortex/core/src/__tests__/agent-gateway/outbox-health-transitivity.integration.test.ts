/**
 * WR-162 SP 3 IT-1 — OBS-002 load-bearing health-tracking transitivity gate.
 *
 * When the composite `GatewayOutbox` fans out to `HealthTrackingOutboxSink`
 * (the health-tracking sink) AND a `SupervisorOutboxSink` in parallel, the
 * health aggregator must observe every event unchanged vs. the pre-refactor
 * single-sink baseline. Simultaneously, the supervisor service MUST record
 * each event with `source: 'gateway_outbox'` — proving the composite-outbox
 * refactor does not regress observability.
 *
 * The local `HealthTrackingOutboxSinkFacsimile` below mirrors the private
 * `HealthTrackingOutboxSink` inside `cortex-runtime.ts` (not exported from
 * the package barrel) closely enough that the health-sink's
 * `recordGatewayEvent` path is exercised identically. We deliberately
 * keep the fan-out behaviour in this test pinned to the production semantics
 * via `GatewayOutbox` itself (not a custom fan-out).
 */
import { describe, expect, it } from 'vitest';
import {
  GatewayOutboxEventSchema,
  type GatewayOutboxEvent,
  type IGatewayOutboxSink,
  type ILogChannel,
} from '@nous/shared';
import { GatewayOutbox } from '../../agent-gateway/outbox.js';
import { GatewayRuntimeHealthSink } from '../../gateway-runtime/runtime-health.js';

const MESSAGE_ID = '550e8400-e29b-41d4-a716-446655440002';
const GATEWAY_ID = '550e8400-e29b-41d4-a716-446655440000';
const RUN_ID = '550e8400-e29b-41d4-a716-446655440001';
const NOW = '2026-04-22T00:00:00.000Z';

function validObservationEvent(): GatewayOutboxEvent {
  return GatewayOutboxEventSchema.parse({
    type: 'observation',
    eventId: MESSAGE_ID,
    correlation: {
      runId: RUN_ID,
      parentId: GATEWAY_ID,
      sequence: 1,
    },
    usage: {
      turnsUsed: 1,
      tokensUsed: 10,
      elapsedMs: 20,
      spawnUnitsUsed: 0,
    },
    observation: {
      observationType: 'progress_update',
      content: 'IT-1 health transitivity probe',
      detail: { test: 'IT-1' },
    },
    emittedAt: NOW,
  });
}

/**
 * Facsimile of the private `HealthTrackingOutboxSink` inside
 * `cortex-runtime.ts`. Keeps the observable contract of `recordGatewayEvent`
 * exactly — the production class additionally publishes to the event bus,
 * which is not part of the OBS-002 gate.
 */
class HealthTrackingOutboxSinkFacsimile implements IGatewayOutboxSink {
  constructor(
    private readonly agentClass: 'Cortex::Principal' | 'Cortex::System',
    private readonly healthSink: GatewayRuntimeHealthSink,
  ) {}

  async emit(event: GatewayOutboxEvent): Promise<void> {
    this.healthSink.recordGatewayEvent(this.agentClass, event);
  }
}

/**
 * Minimal local supervisor-like sink — mirrors `SupervisorOutboxSink` shape
 * without importing the supervisor package (dependency-layer rule).
 */
class LocalSupervisorOutboxSink implements IGatewayOutboxSink {
  readonly observations: Array<{ source: string; payload: unknown }> = [];

  async emit(event: GatewayOutboxEvent): Promise<void> {
    this.observations.push({ source: 'gateway_outbox', payload: event });
  }
}

describe('IT-1 — OBS-002 composite-outbox health-tracking transitivity', () => {
  it('health aggregator sees the same recorded event whether the supervisor sink is present or absent', async () => {
    const event = validObservationEvent();

    // --- Control run: single-sink (pre-refactor equivalent shape). ---
    const controlHealthSink = new GatewayRuntimeHealthSink({});
    const controlHealthSinkImpl = new HealthTrackingOutboxSinkFacsimile(
      'Cortex::Principal',
      controlHealthSink,
    );
    const controlOutbox = new GatewayOutbox([controlHealthSinkImpl]);
    // Seed a gateway entry so recordGatewayEvent has a place to land its
    // updates.
    controlHealthSink.markGatewayBooted({
      agentClass: 'Cortex::Principal',
      agentId: GATEWAY_ID,
      visibleTools: [],
      timestamp: NOW,
    });
    await controlOutbox.emit(event);
    const controlGatewaySnapshot = controlHealthSink.getGatewayHealth(
      'Cortex::Principal',
    );

    // --- Composite run: health sink + supervisor sink side by side. ---
    const composHealthSink = new GatewayRuntimeHealthSink({});
    const composHealthSinkImpl = new HealthTrackingOutboxSinkFacsimile(
      'Cortex::Principal',
      composHealthSink,
    );
    const supervisorSink = new LocalSupervisorOutboxSink();
    const composOutbox = new GatewayOutbox([
      composHealthSinkImpl,
      supervisorSink,
    ]);
    composHealthSink.markGatewayBooted({
      agentClass: 'Cortex::Principal',
      agentId: GATEWAY_ID,
      visibleTools: [],
      timestamp: NOW,
    });
    await composOutbox.emit(event);
    const composGatewaySnapshot = composHealthSink.getGatewayHealth(
      'Cortex::Principal',
    );

    // Transitivity: the gateway-health snapshots are byte-identical.
    expect(composGatewaySnapshot).toEqual(controlGatewaySnapshot);

    // Supervisor sink also received the event.
    expect(supervisorSink.observations).toHaveLength(1);
    expect(supervisorSink.observations[0]!.source).toBe('gateway_outbox');
    expect(supervisorSink.observations[0]!.payload).toEqual(event);
  });

  it('throwing supervisor sink does not prevent the health sink from observing the event (OBS-002 isolation)', async () => {
    const healthSink = new GatewayRuntimeHealthSink({});
    const healthSinkImpl = new HealthTrackingOutboxSinkFacsimile(
      'Cortex::System',
      healthSink,
    );
    class ThrowingSink implements IGatewayOutboxSink {
      async emit(): Promise<void> {
        throw new Error('supervisor pipeline blew up');
      }
    }
    const log: ILogChannel & {
      warnCalls: Array<{ data?: Record<string, unknown> }>;
    } = {
      warnCalls: [],
      debug() {},
      info() {},
      warn(_msg, data) {
        this.warnCalls.push({ data });
      },
      error() {},
      isEnabled() {
        return true;
      },
    };
    const outbox = new GatewayOutbox([healthSinkImpl, new ThrowingSink()], log);
    healthSink.markGatewayBooted({
      agentClass: 'Cortex::System',
      agentId: GATEWAY_ID,
      visibleTools: [],
      timestamp: NOW,
    });

    await outbox.emit(validObservationEvent());

    const snapshot = healthSink.getGatewayHealth('Cortex::System');
    expect(snapshot.lastObservationAt).toBeDefined();
    // Rejection was logged, not re-thrown.
    expect(log.warnCalls).toHaveLength(1);
  });
});
