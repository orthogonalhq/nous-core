import {
  GatewayOutboxEventSchema,
  type GatewayOutboxEvent,
  type IGatewayOutboxSink,
  type ILogChannel,
} from '@nous/shared';

/**
 * Composite gateway outbox — fans each emitted event out to every registered
 * `IGatewayOutboxSink` via `Promise.allSettled`. WR-162 SP 3 §
 * `.architecture/.decisions/2026-03-23-kernel-safety/supervisor-observation-contract-v1.md`
 * OBS-001..005:
 *
 * - OBS-001: single schema parse per `emit`; sinks receive the parsed event.
 * - OBS-002: sinks are isolated — one sink throwing does NOT prevent others
 *   from receiving the event. The rejection is logged via `log?.warn` with
 *   `{ sinkIndex, sinkName, error }` metadata; never re-thrown. This keeps
 *   health-tracking transitivity intact when supervisor sinks land
 *   alongside `HealthTrackingOutboxSink` (IT-1 gate).
 * - OBS-005: no `console.*` calls — all diagnostics route through
 *   `ILogChannel` so WR-157 structured-logging posture is preserved.
 *
 * Zero-sink edge case (`sinks.length === 0`) — `Promise.allSettled([])`
 * resolves to `[]` immediately; `emit` returns without side-effect.
 */
export class GatewayOutbox {
  constructor(
    private readonly sinks: readonly IGatewayOutboxSink[] = [],
    private readonly log?: ILogChannel,
  ) {}

  async emit(event: GatewayOutboxEvent): Promise<void> {
    const parsed = GatewayOutboxEventSchema.parse(event);
    if (this.sinks.length === 0) {
      return;
    }
    const results = await Promise.allSettled(
      this.sinks.map((sink) => sink.emit(parsed)),
    );
    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      if (result.status === 'rejected') {
        const sink = this.sinks[i]!;
        this.log?.warn('outbox sink rejected emit', {
          sinkIndex: i,
          sinkName: (sink as { constructor?: { name?: string } }).constructor
            ?.name ?? 'anonymous',
          error:
            result.reason instanceof Error
              ? { message: result.reason.message, stack: result.reason.stack }
              : result.reason,
        });
      }
    }
  }
}

export class InMemoryGatewayOutboxSink implements IGatewayOutboxSink {
  readonly events: GatewayOutboxEvent[] = [];

  async emit(event: GatewayOutboxEvent): Promise<void> {
    this.events.push(GatewayOutboxEventSchema.parse(event));
  }
}
