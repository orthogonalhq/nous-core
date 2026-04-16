import { describe, it, expect, vi } from 'vitest';
import { ThoughtEmitterImpl } from '../thought-emitter.js';
import type { IEventBus, ThoughtPfcDecisionPayload, ThoughtTurnLifecyclePayload } from '@nous/shared';

function mockEventBus(): IEventBus & { publishCalls: Array<{ channel: string; payload: unknown }> } {
  const publishCalls: Array<{ channel: string; payload: unknown }> = [];
  return {
    publishCalls,
    publish: vi.fn((channel: string, payload: unknown) => {
      publishCalls.push({ channel, payload });
    }),
    subscribe: vi.fn(() => 'sub-id'),
    unsubscribe: vi.fn(),
    dispose: vi.fn(),
  };
}

function pfcPayload(overrides?: Partial<ThoughtPfcDecisionPayload>): ThoughtPfcDecisionPayload {
  return {
    traceId: 'trace-1',
    thoughtType: 'confidence-governance',
    decision: 'approved',
    reason: 'test-reason',
    content: 'test-content',
    sequence: 0,
    emittedAt: '2026-03-27T00:00:00.000Z',
    ...overrides,
  };
}

function lifecyclePayload(overrides?: Partial<ThoughtTurnLifecyclePayload>): ThoughtTurnLifecyclePayload {
  return {
    traceId: 'trace-1',
    phase: 'turn-start',
    status: 'started',
    sequence: 0,
    emittedAt: '2026-03-27T00:00:00.000Z',
    ...overrides,
  };
}

describe('ThoughtEmitterImpl', () => {
  it('emitPfcDecision publishes to thought:pfc-decision with incremented sequence', () => {
    const bus = mockEventBus();
    const emitter = new ThoughtEmitterImpl(bus);

    emitter.emitPfcDecision(pfcPayload());

    expect(bus.publish).toHaveBeenCalledTimes(1);
    expect(bus.publishCalls[0]!.channel).toBe('thought:pfc-decision');
    expect((bus.publishCalls[0]!.payload as ThoughtPfcDecisionPayload).sequence).toBe(0);
  });

  it('emitTurnLifecycle publishes to thought:turn-lifecycle with incremented sequence', () => {
    const bus = mockEventBus();
    const emitter = new ThoughtEmitterImpl(bus);

    emitter.emitTurnLifecycle(lifecyclePayload());

    expect(bus.publish).toHaveBeenCalledTimes(1);
    expect(bus.publishCalls[0]!.channel).toBe('thought:turn-lifecycle');
    expect((bus.publishCalls[0]!.payload as ThoughtTurnLifecyclePayload).sequence).toBe(0);
  });

  it('sequence increments across both methods (shared counter)', () => {
    const bus = mockEventBus();
    const emitter = new ThoughtEmitterImpl(bus);

    emitter.emitPfcDecision(pfcPayload());
    emitter.emitTurnLifecycle(lifecyclePayload());
    emitter.emitPfcDecision(pfcPayload());

    expect((bus.publishCalls[0]!.payload as ThoughtPfcDecisionPayload).sequence).toBe(0);
    expect((bus.publishCalls[1]!.payload as ThoughtTurnLifecyclePayload).sequence).toBe(1);
    expect((bus.publishCalls[2]!.payload as ThoughtPfcDecisionPayload).sequence).toBe(2);
  });

  it('resetSequence resets counter to 0', () => {
    const bus = mockEventBus();
    const emitter = new ThoughtEmitterImpl(bus);

    emitter.emitPfcDecision(pfcPayload());
    emitter.emitPfcDecision(pfcPayload());
    expect((bus.publishCalls[1]!.payload as ThoughtPfcDecisionPayload).sequence).toBe(1);

    emitter.resetSequence();
    emitter.emitPfcDecision(pfcPayload());
    expect((bus.publishCalls[2]!.payload as ThoughtPfcDecisionPayload).sequence).toBe(0);
  });

  it('failed publish does not throw (fire-and-forget)', () => {
    const bus = mockEventBus();
    (bus.publish as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('publish failed');
    });
    const emitter = new ThoughtEmitterImpl(bus);

    expect(() => emitter.emitPfcDecision(pfcPayload())).not.toThrow();
    expect(() => emitter.emitTurnLifecycle(lifecyclePayload())).not.toThrow();
  });

  it('preserves all payload fields except sequence', () => {
    const bus = mockEventBus();
    const emitter = new ThoughtEmitterImpl(bus);

    const payload = pfcPayload({
      traceId: 'trace-42',
      thoughtType: 'memory-write',
      decision: 'denied',
      confidence: 0.3,
      reason: 'low-confidence',
      content: 'approved=false reason=low-confidence',
    });
    emitter.emitPfcDecision(payload);

    const published = bus.publishCalls[0]!.payload as ThoughtPfcDecisionPayload;
    expect(published.traceId).toBe('trace-42');
    expect(published.thoughtType).toBe('memory-write');
    expect(published.decision).toBe('denied');
    expect(published.confidence).toBe(0.3);
    expect(published.reason).toBe('low-confidence');
    expect(published.content).toBe('approved=false reason=low-confidence');
    expect(published.sequence).toBe(0);
  });
});
