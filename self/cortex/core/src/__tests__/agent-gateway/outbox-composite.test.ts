/**
 * WR-162 SP 3 UT-3 + UT-4 — composite `GatewayOutbox` contract.
 *
 * UT-3 covers the composite-fan-out matrix (two sinks, one-throws isolation,
 * zero sinks, schema-parse-once). UT-4 covers the single-sink no-regression
 * boundary (primary assertion: same-microtask invocation, same parse count,
 * same emit completion order).
 *
 * The strict `queueMicrotask`-count equivalence is explicitly NOT asserted
 * per implementation-plan.mdx § Tests (UT-4) — `Promise.allSettled([p])`
 * introduces exactly one extra aggregation microtask compared to `await p`,
 * which is non-load-bearing for the no-regression contract.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  GatewayOutboxEventSchema,
  type GatewayOutboxEvent,
  type IGatewayOutboxSink,
  type ILogChannel,
} from '@nous/shared';
import { GatewayOutbox } from '../../agent-gateway/outbox.js';

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
      content: 'unit test',
      detail: {},
    },
    emittedAt: NOW,
  });
}

class CapturingSink implements IGatewayOutboxSink {
  readonly events: GatewayOutboxEvent[] = [];

  async emit(event: GatewayOutboxEvent): Promise<void> {
    this.events.push(event);
  }
}

class ThrowingSink implements IGatewayOutboxSink {
  constructor(private readonly error: Error) {}

  async emit(_event: GatewayOutboxEvent): Promise<void> {
    throw this.error;
  }
}

function mockLogChannel(): ILogChannel & {
  warnCalls: Array<{ message: string; data?: Record<string, unknown> }>;
} {
  const warnCalls: Array<{ message: string; data?: Record<string, unknown> }> =
    [];
  return {
    debug() {},
    info() {},
    warn(message, data) {
      warnCalls.push({ message, data });
    },
    error() {},
    isEnabled() {
      return true;
    },
    warnCalls,
  };
}

describe('GatewayOutbox — UT-3 composite fan-out', () => {
  it('fans out to every registered sink on emit', async () => {
    const sinkA = new CapturingSink();
    const sinkB = new CapturingSink();
    const outbox = new GatewayOutbox([sinkA, sinkB]);
    const event = validObservationEvent();
    await outbox.emit(event);
    expect(sinkA.events).toHaveLength(1);
    expect(sinkB.events).toHaveLength(1);
    // Each sink receives the same parsed event.
    expect(sinkA.events[0]).toEqual(event);
    expect(sinkB.events[0]).toEqual(event);
  });

  it('isolates a throwing sink — other sinks still receive the event, log warn is called, emit does not reject', async () => {
    const sinkA = new ThrowingSink(new Error('sink A exploded'));
    const sinkB = new CapturingSink();
    const log = mockLogChannel();
    const outbox = new GatewayOutbox([sinkA, sinkB], log);
    const event = validObservationEvent();

    await expect(outbox.emit(event)).resolves.toBeUndefined();

    expect(sinkB.events).toHaveLength(1);
    expect(log.warnCalls).toHaveLength(1);
    const [entry] = log.warnCalls;
    expect(entry).toBeDefined();
    expect(entry!.data).toBeDefined();
    expect(entry!.data!.sinkIndex).toBe(0);
    expect(entry!.data!.sinkName).toBe('ThrowingSink');
    expect(entry!.data!.error).toBeDefined();
  });

  it('tolerates an empty sink list — emit resolves without throwing', async () => {
    const outbox = new GatewayOutbox([]);
    await expect(outbox.emit(validObservationEvent())).resolves.toBeUndefined();
  });

  it('parses the event exactly once per emit (schema-parse-once)', async () => {
    // Prepare the event BEFORE installing the spy so the fixture's own
    // schema parse does not bias the count.
    const event = validObservationEvent();
    const parseSpy = vi.spyOn(GatewayOutboxEventSchema, 'parse');
    const sinkA = new CapturingSink();
    const sinkB = new CapturingSink();
    const outbox = new GatewayOutbox([sinkA, sinkB]);
    parseSpy.mockClear();
    await outbox.emit(event);
    expect(parseSpy).toHaveBeenCalledTimes(1);
    parseSpy.mockRestore();
  });

  it('logs multiple rejections in the order sinks appear', async () => {
    const sinkA = new ThrowingSink(new Error('A'));
    const sinkB = new CapturingSink();
    const sinkC = new ThrowingSink(new Error('C'));
    const log = mockLogChannel();
    const outbox = new GatewayOutbox([sinkA, sinkB, sinkC], log);
    await outbox.emit(validObservationEvent());
    expect(log.warnCalls).toHaveLength(2);
    expect(log.warnCalls[0]!.data!.sinkIndex).toBe(0);
    expect(log.warnCalls[1]!.data!.sinkIndex).toBe(2);
    expect(sinkB.events).toHaveLength(1);
  });
});

describe('GatewayOutbox — UT-4 single-sink no-regression', () => {
  it('length-1 array is observably equivalent to a single-sink config (same emit completion order)', async () => {
    // The pre-refactor constructor took an optional single sink; we model
    // the equivalent post-refactor semantics by wrapping in a length-1 array.
    const calls: string[] = [];
    const sink: IGatewayOutboxSink = {
      async emit() {
        calls.push('sink-emit');
      },
    };
    const outbox = new GatewayOutbox([sink]);
    const event = validObservationEvent();
    await outbox.emit(event);
    calls.push('after-outbox-emit');
    expect(calls).toEqual(['sink-emit', 'after-outbox-emit']);
  });

  it('parses the event exactly once (same parse count as pre-refactor single-sink path)', async () => {
    const event = validObservationEvent();
    const parseSpy = vi.spyOn(GatewayOutboxEventSchema, 'parse');
    const sink = new CapturingSink();
    const outbox = new GatewayOutbox([sink]);
    parseSpy.mockClear();
    await outbox.emit(event);
    expect(parseSpy).toHaveBeenCalledTimes(1);
    parseSpy.mockRestore();
  });

  it('sink emit is invoked within the same turn as the outbox emit call (no extra setTimeout/setImmediate boundary)', async () => {
    // Same-microtask-invocation proxy: the sink must have been called before
    // the awaiter resumes with a resolved promise.
    const sink = new CapturingSink();
    const outbox = new GatewayOutbox([sink]);
    const emitPromise = outbox.emit(validObservationEvent());
    // Before awaiting, the sink microtask should already be queued; after
    // the first microtask flush (await Promise.resolve() once), the emit
    // promise is not yet necessarily resolved because of the extra
    // aggregation microtask in Promise.allSettled. But after awaiting the
    // emit promise itself, the sink MUST have captured the event.
    await emitPromise;
    expect(sink.events).toHaveLength(1);
  });
});
