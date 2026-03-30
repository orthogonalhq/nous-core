/**
 * useEventSubscription — React hook for typed SSE events from the Nous event bus.
 *
 * Reads the events URL from TransportProvider context so it works on both
 * web (relative `/api/events`) and desktop (loopback `http://127.0.0.1:<port>/api/events`).
 *
 * Uses a shared EventSource multiplexer to avoid exhausting the browser's
 * per-host connection limit (~6 for HTTP/1.1). All hooks share a single
 * SSE connection per events URL.
 */
import { useEffect, useRef } from 'react';
import type { EventChannelMap } from '@nous/shared';
import { useEventsUrl } from '../provider';
import { subscribe } from './event-source-multiplexer';

export interface UseEventSubscriptionOptions<C extends keyof EventChannelMap> {
  /** Channel or channels to subscribe to. Supports glob prefixes (e.g., 'health:*'). */
  channels: C[] | string[];
  /** Callback invoked for each received event. */
  onEvent: (channel: string, payload: EventChannelMap[C]) => void;
  /** Whether the subscription is active. Defaults to true. */
  enabled?: boolean;
}

export function useEventSubscription<C extends keyof EventChannelMap>(
  options: UseEventSubscriptionOptions<C>,
): void {
  const { channels, onEvent, enabled = true } = options;
  const eventsUrl = useEventsUrl();

  // Stabilize channels reference via JSON serialization
  const channelsKey = JSON.stringify(channels);

  // Keep onEvent in a ref to avoid reconnecting on callback identity change
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const parsedChannels: string[] = JSON.parse(channelsKey);
    if (parsedChannels.length === 0) {
      return;
    }

    const dispose = subscribe(eventsUrl, parsedChannels, (channel, payload) => {
      onEventRef.current(channel, payload as EventChannelMap[C]);
    });

    return dispose;
  }, [channelsKey, enabled, eventsUrl]);
}
