/**
 * EventSource multiplexer — shared SSE connection for all subscribers.
 *
 * Problem: Each EventSource consumes one HTTP/1.1 connection slot.
 * Browsers limit to ~6 concurrent connections per host. Developer mode
 * can easily exhaust this limit with multiple panels subscribing to
 * different channels, starving tRPC HTTP requests.
 *
 * Solution: Maintain a single EventSource per events URL. When subscribers
 * add/remove channels, tear down and reconnect with the full channel set.
 * Route incoming events to the correct subscriber callbacks.
 */

type Listener = (channel: string, payload: unknown) => void;

interface Subscription {
  id: number;
  channels: string[];
  listener: Listener;
}

interface MuxState {
  source: EventSource | null;
  subscriptions: Map<number, Subscription>;
  activeChannels: Set<string>;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  attempt: number;
  disposed: boolean;
}

const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 1_000;
const JITTER_MAX_MS = 500;

/** One multiplexer per events URL (module-level singleton map). */
const muxes = new Map<string, MuxState>();
let nextSubId = 1;

function getOrCreateMux(eventsUrl: string): MuxState {
  let mux = muxes.get(eventsUrl);
  if (!mux) {
    mux = {
      source: null,
      subscriptions: new Map(),
      activeChannels: new Set(),
      reconnectTimer: null,
      attempt: 0,
      disposed: false,
    };
    muxes.set(eventsUrl, mux);
  }
  return mux;
}

function computeChannels(mux: MuxState): Set<string> {
  const channels = new Set<string>();
  for (const sub of mux.subscriptions.values()) {
    for (const ch of sub.channels) {
      channels.add(ch);
    }
  }
  return channels;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

function clearReconnectTimer(mux: MuxState): void {
  if (mux.reconnectTimer != null) {
    clearTimeout(mux.reconnectTimer);
    mux.reconnectTimer = null;
  }
}

function closeSource(mux: MuxState): void {
  clearReconnectTimer(mux);
  if (mux.source) {
    mux.source.close();
    mux.source = null;
  }
}

function connectMux(mux: MuxState, eventsUrl: string): void {
  if (mux.disposed) return;
  if (typeof EventSource === 'undefined') return;

  const channels = computeChannels(mux);
  if (channels.size === 0) {
    closeSource(mux);
    mux.activeChannels = channels;
    return;
  }

  // Close existing connection before opening new one
  if (mux.source) {
    mux.source.close();
    mux.source = null;
  }

  const channelList = [...channels].sort();
  const url = `${eventsUrl}?channels=${channelList.join(',')}`;
  const source = new EventSource(url);

  source.addEventListener('open', () => {
    mux.attempt = 0;
    console.log(
      `[nous:event-bus:mux] connected channels=${channelList.join(',')} subscribers=${mux.subscriptions.size}`,
    );
  });

  source.addEventListener('error', () => {
    source.close();
    if (mux.disposed || mux.subscriptions.size === 0) return;

    mux.attempt += 1;
    const backoff = Math.min(
      BASE_BACKOFF_MS * Math.pow(2, mux.attempt - 1),
      MAX_BACKOFF_MS,
    );
    const jitter = Math.floor(Math.random() * JITTER_MAX_MS);
    const delay = backoff + jitter;

    console.log(
      `[nous:event-bus:mux] reconnecting attempt=${mux.attempt} delay=${delay}ms`,
    );

    mux.reconnectTimer = setTimeout(() => {
      mux.reconnectTimer = null;
      connectMux(mux, eventsUrl);
    }, delay);
  });

  // Register a listener for EACH channel and fan out to subscribers
  for (const channel of channelList) {
    source.addEventListener(channel, (event: MessageEvent) => {
      let payload: unknown;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return; // malformed event
      }

      for (const sub of mux.subscriptions.values()) {
        if (sub.channels.includes(channel)) {
          try {
            sub.listener(channel, payload);
          } catch {
            // subscriber error — don't crash the mux
          }
        }
      }
    });
  }

  mux.source = source;
  mux.activeChannels = channels;
}

/**
 * Subscribe to event channels via the shared multiplexer.
 * Returns a dispose function that removes this subscription.
 */
export function subscribe(
  eventsUrl: string,
  channels: string[],
  listener: Listener,
): () => void {
  const mux = getOrCreateMux(eventsUrl);
  const id = nextSubId++;

  mux.subscriptions.set(id, { id, channels, listener });

  // Reconnect if the channel set changed
  const needed = computeChannels(mux);
  if (!setsEqual(needed, mux.activeChannels)) {
    connectMux(mux, eventsUrl);
  }

  return () => {
    mux.subscriptions.delete(id);

    const remaining = computeChannels(mux);
    if (remaining.size === 0) {
      closeSource(mux);
      mux.activeChannels = remaining;
      muxes.delete(eventsUrl);
    } else if (!setsEqual(remaining, mux.activeChannels)) {
      connectMux(mux, eventsUrl);
    }
  };
}
