import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useEventSubscription } from '../useEventSubscription';

// --- Mock EventSource ---

type EventSourceListener = (event: MessageEvent) => void;
type OpenListener = () => void;
type ErrorListener = () => void;

class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  readyState = 0;
  private listeners = new Map<string, EventSourceListener[]>();
  private openListeners: OpenListener[] = [];
  private errorListeners: ErrorListener[] = [];
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(event: string, handler: (...args: any[]) => void) {
    if (event === 'open') {
      this.openListeners.push(handler as OpenListener);
      return;
    }
    if (event === 'error') {
      this.errorListeners.push(handler as ErrorListener);
      return;
    }
    const existing = this.listeners.get(event) ?? [];
    existing.push(handler as EventSourceListener);
    this.listeners.set(event, existing);
  }

  close() {
    this.closed = true;
  }

  // Test helpers
  simulateOpen() {
    for (const listener of this.openListeners) {
      listener();
    }
  }

  simulateEvent(channel: string, data: unknown) {
    const handlers = this.listeners.get(channel) ?? [];
    const event = { data: JSON.stringify(data) } as MessageEvent;
    for (const handler of handlers) {
      handler(event);
    }
  }

  simulateEventRaw(channel: string, rawData: string) {
    const handlers = this.listeners.get(channel) ?? [];
    const event = { data: rawData } as MessageEvent;
    for (const handler of handlers) {
      handler(event);
    }
  }

  simulateError() {
    for (const listener of this.errorListeners) {
      listener();
    }
  }
}

describe('useEventSubscription', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    cleanup();
  });

  it('T1 — subscribes on mount with correct URL and channel params', () => {
    renderHook(() =>
      useEventSubscription({
        channels: ['health:boot-step'],
        onEvent: vi.fn(),
        enabled: true,
      }),
    );

    expect(MockEventSource.instances).toHaveLength(1);
    const source = MockEventSource.instances[0]!;
    expect(source.url).toBe('/api/events?channels=health:boot-step');
    expect(source.closed).toBe(false);
  });

  it('T2 — receives typed events and calls callback', () => {
    const onEvent = vi.fn();
    renderHook(() =>
      useEventSubscription({
        channels: ['health:boot-step'],
        onEvent,
        enabled: true,
      }),
    );

    const source = MockEventSource.instances[0]!;
    const payload = { step: 'subcortex_initialized', status: 'completed' };
    source.simulateEvent('health:boot-step', payload);

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith('health:boot-step', payload);
  });

  it('T3 — cleans up EventSource on unmount', () => {
    const { unmount } = renderHook(() =>
      useEventSubscription({
        channels: ['health:boot-step'],
        onEvent: vi.fn(),
        enabled: true,
      }),
    );

    const source = MockEventSource.instances[0]!;
    expect(source.closed).toBe(false);

    unmount();

    expect(source.closed).toBe(true);
  });

  it('T4 — reconnects after error with backoff', () => {
    renderHook(() =>
      useEventSubscription({
        channels: ['health:boot-step'],
        onEvent: vi.fn(),
        enabled: true,
      }),
    );

    expect(MockEventSource.instances).toHaveLength(1);
    const firstSource = MockEventSource.instances[0]!;

    // Simulate error
    firstSource.simulateError();
    expect(firstSource.closed).toBe(true);

    // No new connection yet (waiting for backoff)
    expect(MockEventSource.instances).toHaveLength(1);

    // Advance past the backoff delay (1s base + up to 500ms jitter)
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    // A new EventSource should have been created
    expect(MockEventSource.instances).toHaveLength(2);
    const secondSource = MockEventSource.instances[1]!;
    expect(secondSource.url).toBe('/api/events?channels=health:boot-step');
    expect(secondSource.closed).toBe(false);
  });

  it('T5 — does not create EventSource when enabled=false', () => {
    renderHook(() =>
      useEventSubscription({
        channels: ['health:boot-step'],
        onEvent: vi.fn(),
        enabled: false,
      }),
    );

    expect(MockEventSource.instances).toHaveLength(0);
  });

  it('T6 — JSON.parse failure does not crash', () => {
    const onEvent = vi.fn();
    renderHook(() =>
      useEventSubscription({
        channels: ['health:boot-step'],
        onEvent,
        enabled: true,
      }),
    );

    const source = MockEventSource.instances[0]!;

    // Send invalid JSON — should not throw or call onEvent
    expect(() => {
      source.simulateEventRaw('health:boot-step', 'not-valid-json{{{');
    }).not.toThrow();

    expect(onEvent).not.toHaveBeenCalled();
  });
});
