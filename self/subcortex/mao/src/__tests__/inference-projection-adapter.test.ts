import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InferenceProjectionAdapter } from '../inference-projection-adapter.js';
import type {
  IEventBus,
  InferenceCallCompletePayload,
  InferenceStreamStartPayload,
  InferenceStreamCompletePayload,
} from '@nous/shared';

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

function createCallComplete(overrides?: Partial<InferenceCallCompletePayload>): InferenceCallCompletePayload {
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

function createStreamStart(overrides?: Partial<InferenceStreamStartPayload>): InferenceStreamStartPayload {
  return {
    providerId: 'provider-1',
    modelId: 'model-1',
    agentClass: 'Cortex::Principal',
    traceId: 'trace-1',
    projectId: 'project-1',
    laneKey: 'lane-1',
    emittedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createStreamComplete(overrides?: Partial<InferenceStreamCompletePayload>): InferenceStreamCompletePayload {
  return createCallComplete(overrides);
}

describe('InferenceProjectionAdapter', () => {
  let eventBus: ReturnType<typeof createMockEventBus>;
  let adapter: InferenceProjectionAdapter;

  beforeEach(() => {
    eventBus = createMockEventBus();
    adapter = new InferenceProjectionAdapter(eventBus);
  });

  // --- Contract Tests (Tier 1) ---

  describe('recordCall() updates per-agent state', () => {
    it('keyed by agentClass', () => {
      eventBus.simulateEvent('inference:call-complete', createCallComplete());

      const state = adapter.getAgentInferenceState('Cortex::Principal');
      expect(state).not.toBeNull();
      expect(state?.lastProviderId).toBe('provider-1');
      expect(state?.lastModelId).toBe('model-1');
      expect(state?.lastLatencyMs).toBe(200);
      expect(state?.totalTokens).toBe(150);
      expect(state?.callCount).toBe(1);
      expect(state?.isStreaming).toBe(false);
    });
  });

  describe('traceId fallback key', () => {
    it('falls back to traceId when agentClass is absent', () => {
      eventBus.simulateEvent('inference:call-complete', createCallComplete({
        agentClass: undefined,
        traceId: 'fallback-trace',
      }));

      expect(adapter.getAgentInferenceState('fallback-trace')).not.toBeNull();
      expect(adapter.getAgentInferenceState('Cortex::Principal')).toBeNull();
    });
  });

  describe('stream lifecycle', () => {
    it('recordStreamStart() sets isStreaming: true and adds to activeStreams', () => {
      eventBus.simulateEvent('inference:stream-start', createStreamStart({ traceId: 'stream-trace' }));

      const state = adapter.getAgentInferenceState('Cortex::Principal');
      expect(state?.isStreaming).toBe(true);

      const streams = adapter.getActiveStreams();
      expect(streams).toHaveLength(1);
      expect(streams[0].traceId).toBe('stream-trace');
    });

    it('recordStreamComplete() sets isStreaming: false, removes from activeStreams, updates state and history', () => {
      eventBus.simulateEvent('inference:stream-start', createStreamStart({ traceId: 'stream-trace' }));
      eventBus.simulateEvent('inference:stream-complete', createStreamComplete({ traceId: 'stream-trace', latencyMs: 500 }));

      const state = adapter.getAgentInferenceState('Cortex::Principal');
      expect(state?.isStreaming).toBe(false);
      expect(state?.lastLatencyMs).toBe(500);

      const streams = adapter.getActiveStreams();
      expect(streams).toHaveLength(0);

      const history = adapter.getInferenceHistory();
      expect(history).toHaveLength(1);
      expect(history[0].latencyMs).toBe(500);
    });
  });

  describe('history ring buffer', () => {
    it('trims at 200 entries (oldest dropped)', () => {
      for (let i = 0; i < 250; i++) {
        eventBus.simulateEvent('inference:call-complete', createCallComplete({
          traceId: `trace-${i}`,
          latencyMs: i,
        }));
      }

      const history = adapter.getInferenceHistory();
      expect(history).toHaveLength(200);
      // Oldest entries should have been dropped
      expect(history[0].latencyMs).toBe(50);
      expect(history[199].latencyMs).toBe(249);
    });
  });

  describe('getAgentInferenceState()', () => {
    it('returns null for unknown agent', () => {
      expect(adapter.getAgentInferenceState('unknown-agent')).toBeNull();
    });
  });

  describe('getInferenceHistory()', () => {
    it('supports filtering by agentClass', () => {
      eventBus.simulateEvent('inference:call-complete', createCallComplete({ agentClass: 'AgentA' }));
      eventBus.simulateEvent('inference:call-complete', createCallComplete({ agentClass: 'AgentB' }));
      eventBus.simulateEvent('inference:call-complete', createCallComplete({ agentClass: 'AgentA' }));

      const filtered = adapter.getInferenceHistory({ agentClass: 'AgentA' });
      expect(filtered).toHaveLength(2);
      expect(filtered.every((e) => e.agentClass === 'AgentA')).toBe(true);
    });

    it('supports limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        eventBus.simulateEvent('inference:call-complete', createCallComplete({ traceId: `t-${i}` }));
      }

      const limited = adapter.getInferenceHistory({ limit: 3 });
      expect(limited).toHaveLength(3);
      // Should be the last 3
      expect(limited[0].traceId).toBe('t-7');
    });
  });

  describe('getActiveStreams()', () => {
    it('returns current active stream entries', () => {
      eventBus.simulateEvent('inference:stream-start', createStreamStart({ traceId: 'a' }));
      eventBus.simulateEvent('inference:stream-start', createStreamStart({ traceId: 'b' }));

      const streams = adapter.getActiveStreams();
      expect(streams).toHaveLength(2);
      expect(streams.map((s) => s.traceId).sort()).toEqual(['a', 'b']);
    });
  });

  describe('dispose()', () => {
    it('clears all internal state', () => {
      eventBus.simulateEvent('inference:call-complete', createCallComplete());
      eventBus.simulateEvent('inference:stream-start', createStreamStart());

      adapter.dispose();

      expect(adapter.getAgentInferenceState('Cortex::Principal')).toBeNull();
      expect(adapter.getInferenceHistory()).toHaveLength(0);
      expect(adapter.getActiveStreams()).toHaveLength(0);
    });
  });

  // --- Behavior Tests (Tier 2) ---

  describe('behavior', () => {
    it('stream-start for unknown agent creates new state entry with isStreaming: true', () => {
      eventBus.simulateEvent('inference:stream-start', createStreamStart({ agentClass: 'NewAgent' }));

      const state = adapter.getAgentInferenceState('NewAgent');
      expect(state).not.toBeNull();
      expect(state?.isStreaming).toBe(true);
      expect(state?.callCount).toBe(0);
      expect(state?.totalTokens).toBe(0);
    });

    it('multiple agents tracked independently', () => {
      eventBus.simulateEvent('inference:call-complete', createCallComplete({
        agentClass: 'AgentA',
        inputTokens: 100,
        outputTokens: 50,
      }));
      eventBus.simulateEvent('inference:call-complete', createCallComplete({
        agentClass: 'AgentB',
        inputTokens: 200,
        outputTokens: 100,
      }));

      const stateA = adapter.getAgentInferenceState('AgentA');
      const stateB = adapter.getAgentInferenceState('AgentB');
      expect(stateA?.totalTokens).toBe(150);
      expect(stateB?.totalTokens).toBe(300);
    });

    it('totalTokens accumulates across multiple calls for same agent', () => {
      eventBus.simulateEvent('inference:call-complete', createCallComplete({
        agentClass: 'AgentA',
        inputTokens: 100,
        outputTokens: 50,
      }));
      eventBus.simulateEvent('inference:call-complete', createCallComplete({
        agentClass: 'AgentA',
        inputTokens: 200,
        outputTokens: 100,
      }));

      const state = adapter.getAgentInferenceState('AgentA');
      expect(state?.totalTokens).toBe(450);
      expect(state?.callCount).toBe(2);
    });
  });
});
