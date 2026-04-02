/**
 * SSE handler factory for the Nous event bus.
 *
 * Creates a request handler that streams events from the bus to connected
 * clients as SSE frames. Supports channel filtering via ?channels= query
 * parameter with glob-like prefix matching (e.g., health:*).
 *
 * Design: factory pattern closes over the eventBus reference so the
 * returned handler has a standard (req, res) => void signature compatible
 * with both bare http.createServer and Next.js API routes.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { EventChannelMap, IEventBus } from '@nous/shared';

/** All known channel names for subscribing to "all". */
const ALL_CHANNELS: (keyof EventChannelMap)[] = [
  'health:boot-step',
  'health:gateway-status',
  'health:issue',
  'health:backlog-analytics',
  'app-health:change',
  'app-health:heartbeat',
  'mao:projection-changed',
  'mao:control-action',
  'voice:state-change',
  'voice:transcription',
  'lifecycle:transition',
  'escalation:new',
  'escalation:resolved',
  'system:backlog-change',
  'system:outbox-event',
  'system:turn-ack',
  'thought:pfc-decision',
  'thought:turn-lifecycle',
  'inference:call-complete',
  'inference:stream-start',
  'inference:stream-complete',
  'inference:accumulator-snapshot',
  'workflow:node-status-changed',
  'workflow:run-completed',
  'workflow:spec-updated',
];

const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Parse the ?channels= query parameter into a list of channel names.
 * Supports exact matches and prefix globs (e.g., "health:*" matches all
 * channels starting with "health:").
 *
 * Returns all channels if no filter is specified or the filter is empty.
 */
function resolveChannels(channelsParam: string | null): (keyof EventChannelMap)[] {
  if (!channelsParam || channelsParam.trim() === '') {
    return ALL_CHANNELS;
  }

  const filters = channelsParam.split(',').map((f) => f.trim()).filter(Boolean);
  if (filters.length === 0) {
    return ALL_CHANNELS;
  }

  const matched = new Set<keyof EventChannelMap>();
  for (const filter of filters) {
    if (filter.endsWith('*')) {
      // Prefix glob: "health:*" matches "health:boot-step", etc.
      const prefix = filter.slice(0, -1);
      for (const channel of ALL_CHANNELS) {
        if ((channel as string).startsWith(prefix)) {
          matched.add(channel);
        }
      }
    } else {
      // Exact match
      if (ALL_CHANNELS.includes(filter as keyof EventChannelMap)) {
        matched.add(filter as keyof EventChannelMap);
      }
    }
  }

  // If no valid filters matched, subscribe to all (permissive default).
  return matched.size > 0 ? [...matched] : ALL_CHANNELS;
}

/**
 * Write a single SSE frame to the response.
 */
function writeSseFrame(res: ServerResponse, event: string, data: string): void {
  res.write(`event: ${event}\ndata: ${data}\n\n`);
}

/**
 * Create an SSE request handler bound to the given event bus.
 */
export function createEventSseHandler(
  eventBus: IEventBus,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req: IncomingMessage, res: ServerResponse) => {
    // Parse query string for channel filter
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const channelsParam = url.searchParams.get('channels');
    const channels = resolveChannels(channelsParam);

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    // Flush headers immediately
    res.flushHeaders();

    // Track subscription IDs for cleanup
    const subscriptionIds: string[] = [];

    // Subscribe to each requested channel
    for (const channel of channels) {
      const id = eventBus.subscribe(channel, (payload) => {
        try {
          writeSseFrame(res, channel as string, JSON.stringify(payload));
        } catch {
          // Write failed — connection likely closed, cleanup will happen via 'close' event
        }
      });
      subscriptionIds.push(id);
    }

    // Heartbeat interval to keep the connection alive
    const heartbeatInterval = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        // Write failed — connection closing
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Cleanup on connection close
    res.on('close', () => {
      clearInterval(heartbeatInterval);
      for (const id of subscriptionIds) {
        eventBus.unsubscribe(id);
      }
    });
  };
}
