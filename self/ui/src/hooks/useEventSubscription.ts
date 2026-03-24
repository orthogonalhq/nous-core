import { useEffect, useRef, useCallback } from 'react';
import type { EventChannelMap } from '@nous/shared';

export interface UseEventSubscriptionOptions<C extends keyof EventChannelMap> {
  /** Channel or channels to subscribe to. Supports glob prefixes (e.g., 'health:*'). */
  channels: C[] | string[];
  /** Callback invoked for each received event. */
  onEvent: (channel: string, payload: EventChannelMap[C]) => void;
  /** Whether the subscription is active. Defaults to true. */
  enabled?: boolean;
}

const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 1_000;
const JITTER_MAX_MS = 500;

/**
 * React hook for subscribing to typed SSE events from the Nous event bus.
 *
 * Connects to `/api/events` with channel filtering via query parameter.
 * Auto-reconnects with exponential backoff on connection drop.
 * Cleans up EventSource and timers on unmount or when disabled.
 */
export function useEventSubscription<C extends keyof EventChannelMap>(
  options: UseEventSubscriptionOptions<C>,
): void {
  const { channels, onEvent, enabled = true } = options;

  // Stabilize channels reference via JSON serialization
  const channelsKey = JSON.stringify(channels);

  // Keep onEvent in a ref to avoid reconnecting on callback identity change
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(
    (channelList: string[]) => {
      const url = `/api/events?channels=${channelList.join(',')}`;
      const source = new EventSource(url);
      return { source, channelList };
    },
    [],
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const parsedChannels: string[] = JSON.parse(channelsKey);
    if (parsedChannels.length === 0) {
      return;
    }

    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let disposed = false;

    function clearReconnectTimer() {
      if (reconnectTimer != null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    }

    function createConnection() {
      if (disposed) {
        return;
      }

      if (typeof EventSource === 'undefined') {
        return;
      }

      const url = `/api/events?channels=${parsedChannels.join(',')}`;
      const source = new EventSource(url);

      source.addEventListener('open', () => {
        attempt = 0;
        console.log(`[nous:event-bus:client] connected channels=${parsedChannels.join(',')}`);
      });

      source.addEventListener('error', () => {
        source.close();

        if (disposed) {
          return;
        }

        attempt += 1;
        const backoff = Math.min(BASE_BACKOFF_MS * Math.pow(2, attempt - 1), MAX_BACKOFF_MS);
        const jitter = Math.floor(Math.random() * JITTER_MAX_MS);
        const delay = backoff + jitter;

        console.log(
          `[nous:event-bus:client] reconnecting attempt=${attempt} delay=${delay}ms`,
        );

        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          createConnection();
        }, delay);
      });

      // Register listeners for each channel
      for (const channel of parsedChannels) {
        source.addEventListener(channel, (event: MessageEvent) => {
          try {
            const payload = JSON.parse(event.data);
            onEventRef.current(channel, payload);
          } catch {
            // JSON.parse failure — do not crash the component
          }
        });
      }

      eventSource = source;
    }

    createConnection();

    return () => {
      disposed = true;
      clearReconnectTimer();
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };
  }, [channelsKey, enabled, connect]);
}
