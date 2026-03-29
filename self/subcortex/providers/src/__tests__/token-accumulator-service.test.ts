import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenAccumulatorService } from '../token-accumulator-service.js';
import type { IEventBus, InferenceCallCompletePayload } from '@nous/shared';

// --- Helpers ---

type Handler = (payload: any) => void;

function createMockEventBus(): IEventBus & {
  handlers: Map<string, Handler>;
  simulateEvent: (channel: string, payload: any) => void;
} {
  const handlers = new Map<string, Handler>();
  let subId = 0;
  return {
    handlers,
    publish: vi.fn(),
    subscribe: vi.fn().mockImplementation((channel: string, handler: Handler) => {
      const id = `sub-${subId++}`;
      handlers.set(id, handler);
      // Also store by channel for easy lookup
      handlers.set(`channel:${channel}`, handler);
      return id;
    }),
    unsubscribe: vi.fn(),
    dispose: vi.fn(),
    simulateEvent(channel: string, payload: any) {
      const handler = handlers.get(`channel:${channel}`);
      if (handler) handler(payload);
    },
  };
}

function createCallCompletePayload(overrides?: Partial<InferenceCallCompletePayload>): InferenceCallCompletePayload {
  return {
    providerId: 'provider-1',
    modelId: 'model-1',
    agentClass: 'Cortex::Principal',
    traceId: 'trace-1',
    projectId: 'project-1',
    laneKey: 'lane-1',
    inputTokens: 100,
    outputTokens: 50,
    latencyMs: 200,
    emittedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('TokenAccumulatorService', () => {
  let eventBus: ReturnType<typeof createMockEventBus>;
  let service: TokenAccumulatorService;

  beforeEach(() => {
    vi.useFakeTimers();
    eventBus = createMockEventBus();
    service = new TokenAccumulatorService(eventBus, { snapshotIntervalMs: 30_000 });
  });

  afterEach(() => {
    service.dispose();
    vi.useRealTimers();
  });

  // --- Contract Tests (Tier 1) ---

  describe('record() accumulates token counts correctly', () => {
    it('accumulates across multiple events', () => {
      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload());
      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload({ inputTokens: 200, outputTokens: 100 }));

      const summary = service.getUsageSummary();
      expect(summary.today.inputTokens).toBe(300);
      expect(summary.today.outputTokens).toBe(150);
      expect(summary.today.callCount).toBe(2);
    });

    it('stream-complete events also accumulate', () => {
      eventBus.simulateEvent('inference:stream-complete', createCallCompletePayload());
      const summary = service.getUsageSummary();
      expect(summary.today.callCount).toBe(1);
    });
  });

  describe('window rotation', () => {
    it('today window clears on new day', () => {
      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload());
      expect(service.getUsageSummary().today.callCount).toBe(1);

      // Advance to next day
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(1, 0, 0, 0);
      vi.setSystemTime(tomorrow);

      // Next event triggers rotation
      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload());
      expect(service.getUsageSummary().today.callCount).toBe(1); // Only the new event
    });

    it('week window clears on new week (Monday)', () => {
      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload());
      expect(service.getUsageSummary().week.callCount).toBe(1);

      // Advance to next Monday
      const now = new Date();
      const daysUntilMonday = ((8 - now.getDay()) % 7) || 7;
      const nextMonday = new Date(now);
      nextMonday.setDate(now.getDate() + daysUntilMonday);
      nextMonday.setHours(1, 0, 0, 0);
      vi.setSystemTime(nextMonday);

      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload());
      expect(service.getUsageSummary().week.callCount).toBe(1);
    });

    it('month window clears on new month', () => {
      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload());
      expect(service.getUsageSummary().month.callCount).toBe(1);

      // Advance to next month
      const now = new Date();
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 2, 1, 0, 0, 0);
      vi.setSystemTime(nextMonth);

      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload());
      expect(service.getUsageSummary().month.callCount).toBe(1);
    });
  });

  describe('getUsageSummary()', () => {
    it('returns { today, week, month } each with WindowSummary shape', () => {
      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload());

      const summary = service.getUsageSummary();
      expect(summary).toHaveProperty('today');
      expect(summary).toHaveProperty('week');
      expect(summary).toHaveProperty('month');

      for (const window of [summary.today, summary.week, summary.month]) {
        expect(window).toHaveProperty('inputTokens');
        expect(window).toHaveProperty('outputTokens');
        expect(window).toHaveProperty('callCount');
        expect(window).toHaveProperty('windowStart');
        expect(typeof window.windowStart).toBe('string');
      }
    });
  });

  describe('getProviderBreakdown()', () => {
    it('returns per-provider entries for today window', () => {
      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload({ providerId: 'p1' }));
      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload({ providerId: 'p2', inputTokens: 200 }));
      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload({ providerId: 'p1' }));

      const breakdown = service.getProviderBreakdown();
      expect(breakdown).toHaveLength(2);

      const p1 = breakdown.find((e) => e.providerId === 'p1');
      const p2 = breakdown.find((e) => e.providerId === 'p2');
      expect(p1?.callCount).toBe(2);
      expect(p1?.inputTokens).toBe(200);
      expect(p2?.callCount).toBe(1);
      expect(p2?.inputTokens).toBe(200);
    });
  });

  describe('snapshot emission', () => {
    it('fires on configured interval via setInterval', () => {
      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload());

      vi.advanceTimersByTime(30_000);

      expect(eventBus.publish).toHaveBeenCalledWith(
        'inference:accumulator-snapshot',
        expect.objectContaining({
          totalInputTokens: 100,
          totalOutputTokens: 50,
          emittedAt: expect.any(String),
          windowStart: expect.any(String),
          providerBreakdown: expect.objectContaining({
            'provider-1': expect.objectContaining({
              inputTokens: 100,
              outputTokens: 50,
              callCount: 1,
            }),
          }),
        }),
      );
    });
  });

  describe('dispose()', () => {
    it('clears interval timer', () => {
      service.dispose();

      vi.advanceTimersByTime(60_000);
      // publish may have been called before dispose, but no new snapshot
      const publishCalls = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls;
      const snapshotCalls = publishCalls.filter(
        ([ch]: [string]) => ch === 'inference:accumulator-snapshot',
      );
      expect(snapshotCalls).toHaveLength(0);
    });
  });

  // --- Behavior Tests (Tier 2) ---

  describe('behavior', () => {
    it('events with undefined inputTokens/outputTokens are handled (treated as 0)', () => {
      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload({
        inputTokens: undefined,
        outputTokens: undefined,
      }));

      const summary = service.getUsageSummary();
      expect(summary.today.inputTokens).toBe(0);
      expect(summary.today.outputTokens).toBe(0);
      expect(summary.today.callCount).toBe(1);
    });

    it('multiple providers accumulate independently', () => {
      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload({ providerId: 'a', inputTokens: 10 }));
      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload({ providerId: 'b', inputTokens: 20 }));

      const breakdown = service.getProviderBreakdown();
      const a = breakdown.find((e) => e.providerId === 'a');
      const b = breakdown.find((e) => e.providerId === 'b');
      expect(a?.inputTokens).toBe(10);
      expect(b?.inputTokens).toBe(20);
    });
  });

  // --- Edge Case Tests (Tier 3) ---

  describe('edge cases', () => {
    it('snapshot after dispose does not throw', () => {
      service.dispose();
      // Manually trigger what would be a snapshot cycle
      vi.advanceTimersByTime(60_000);
      // No error thrown
    });

    it('zero-token events still increment callCount', () => {
      eventBus.simulateEvent('inference:call-complete', createCallCompletePayload({
        inputTokens: 0,
        outputTokens: 0,
      }));

      const summary = service.getUsageSummary();
      expect(summary.today.callCount).toBe(1);
      expect(summary.today.inputTokens).toBe(0);
    });
  });
});
