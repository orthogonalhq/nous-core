/**
 * SupervisorOutboxSink — composite-outbox sink that records every gateway
 * outbox event as a raw `SupervisorObservation` on the supervisor service's
 * anomaly buffer.
 *
 * WR-162 SP 3 — `.architecture/.decisions/2026-03-23-kernel-safety/supervisor-observation-contract-v1.md`
 * (OBS-001..005). No classification here; SP 4 adds detectors that read
 * the anomaly buffer downstream.
 *
 * OBS-003: `emit` is sub-millisecond, no I/O, no external awaits. It
 * returns a resolved promise to satisfy the `IGatewayOutboxSink` contract
 * while keeping the critical path synchronous under the composite-outbox
 * `Promise.allSettled` fan-out.
 */
import type {
  GatewayOutboxEvent,
  IGatewayOutboxSink,
} from '@nous/shared';
import type { SupervisorService } from './supervisor-service.js';

export class SupervisorOutboxSink implements IGatewayOutboxSink {
  private readonly now: () => string;

  constructor(
    private readonly service: SupervisorService,
    now?: () => string,
  ) {
    this.now = now ?? (() => new Date().toISOString());
  }

  async emit(event: GatewayOutboxEvent): Promise<void> {
    this.service.recordObservation({
      observedAt: this.now(),
      source: 'gateway_outbox',
      payload: event,
    });
  }
}
