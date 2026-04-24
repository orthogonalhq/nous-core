/**
 * WR-162 SP 3 UT-8 — SupervisorOutboxSink records every gateway outbox event
 * as a `SupervisorObservation` on the service's anomaly buffer.
 */
import { describe, expect, it } from 'vitest';
import {
  GatewayOutboxEventSchema,
  SupervisorObservationSchema,
  type GatewayOutboxEvent,
} from '@nous/shared';
import { SupervisorService } from '../supervisor-service.js';
import { SupervisorOutboxSink } from '../supervisor-outbox-sink.js';

const RUN_ID = '550e8400-e29b-41d4-a716-446655440001';
const GATEWAY_ID = '550e8400-e29b-41d4-a716-446655440000';
const MESSAGE_ID = '550e8400-e29b-41d4-a716-446655440002';
const NOW = '2026-04-22T00:00:00.000Z';

function validObservationEvent(): GatewayOutboxEvent {
  // Parse through the schema so the returned value is a branded
  // `GatewayOutboxEvent` — avoids widening `as` casts in the sink boundary.
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
      content: 'unit-test observation',
      detail: {},
    },
    emittedAt: NOW,
  });
}

describe('SupervisorOutboxSink', () => {
  it('records a SupervisorObservation for every emit with source: gateway_outbox', async () => {
    const captured: unknown[] = [];
    const svc = new SupervisorService();
    const original = svc.recordObservation.bind(svc);
    svc.recordObservation = (obs) => {
      captured.push(obs);
      original(obs);
    };
    const sink = new SupervisorOutboxSink(svc);
    const event = validObservationEvent();

    await sink.emit(event);

    expect(captured).toHaveLength(1);
    const obs = captured[0] as { source: string; payload: unknown };
    expect(obs.source).toBe('gateway_outbox');
    expect(obs.payload).toBe(event);
    const parsed = SupervisorObservationSchema.safeParse(obs);
    expect(parsed.success).toBe(true);
  });

  it('each emit increments the recordObservation call count', async () => {
    const svc = new SupervisorService();
    let calls = 0;
    const original = svc.recordObservation.bind(svc);
    svc.recordObservation = (obs) => {
      calls += 1;
      original(obs);
    };
    const sink = new SupervisorOutboxSink(svc);
    const event = validObservationEvent();
    await sink.emit(event);
    await sink.emit(event);
    await sink.emit(event);
    expect(calls).toBe(3);
  });

  it('uses the injected clock for observedAt', async () => {
    const fixedIso = '2026-04-22T00:00:00.000Z';
    const svc = new SupervisorService();
    let captured: { observedAt: string } | null = null;
    svc.recordObservation = (obs) => {
      captured = obs as unknown as { observedAt: string };
    };
    const sink = new SupervisorOutboxSink(svc, () => fixedIso);
    await sink.emit(validObservationEvent());
    expect(captured).not.toBeNull();
    expect(captured!.observedAt).toBe(fixedIso);
  });
});
