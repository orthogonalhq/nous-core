'use client';

/**
 * TransportProvider — platform-aware tRPC + React Query + events context.
 *
 * Each platform shell calls a factory (`createWebTransport` or
 * `createDesktopTransport`) and passes the result to `<TransportProvider>`.
 * Components below the provider use `trpc` hooks and `useEventSubscription`
 * without knowing which platform they run on.
 */
import { useState, createContext, useContext } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { trpc } from './client';

// ---------------------------------------------------------------------------
// Transport config
// ---------------------------------------------------------------------------

export interface TransportConfig {
  /** Full URL for tRPC endpoint, e.g. "/api/trpc" or "http://localhost:4317/api/trpc" */
  trpcUrl: string;
  /** Full URL for SSE events endpoint, e.g. "/api/events" or "http://localhost:4317/api/events" */
  eventsUrl: string;
}

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

/**
 * Create transport config for the web app.
 * @param baseUrl - Optional base URL (defaults to '' for relative URLs).
 */
export function createWebTransport(baseUrl = ''): TransportConfig {
  return {
    trpcUrl: `${baseUrl}/api/trpc`,
    eventsUrl: `${baseUrl}/api/events`,
  };
}

/**
 * Create transport config for the desktop renderer.
 * @param port - The backend server port on loopback.
 */
export function createDesktopTransport(port: number): TransportConfig {
  const base = `http://localhost:${port}`;
  return {
    trpcUrl: `${base}/api/trpc`,
    eventsUrl: `${base}/api/events`,
  };
}

// ---------------------------------------------------------------------------
// Events URL context (used by useEventSubscription)
// ---------------------------------------------------------------------------

const EventsUrlContext = createContext<string>('/api/events');

/**
 * Read the events base URL set by the nearest TransportProvider.
 * @internal — used by `useEventSubscription`.
 */
export function useEventsUrl(): string {
  return useContext(EventsUrlContext);
}

// ---------------------------------------------------------------------------
// Provider component
// ---------------------------------------------------------------------------

export interface TransportProviderProps {
  config: TransportConfig;
  children: React.ReactNode;
}

export function TransportProvider({ config, children }: TransportProviderProps) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: 1 } },
  }));
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        // WR-162 SP 1.16 (SUPV-SP1.16-001 / SUPV-SP1.16-002 / SUPV-SP1.16-003)
        // — RC-2 contract cap: bound the link's per-batch URL length and item
        // count to prevent first-paint fan-out from producing a single oversize
        // GET URL that browsers reject (Chromium ~8KB header line ⇒ 431).
        // `7000` lies ~1KB below the binding browser limit (defense-in-depth
        // headroom); `1000` items is well above any plausible legitimate batch
        // (~96 in BT R1 was the failure case) and well below pathological
        // micro-query fan-outs. tRPC v11 splits any oversize batch into
        // multiple sub-requests automatically; consumers above the link see
        // per-operation results unchanged. See `phase-1.16/sds.mdx` Mechanism
        // Choice rows 1-3 for cap-value rationale.
        httpBatchLink({
          url: config.trpcUrl,
          transformer: superjson,
          maxURLLength: 7000,
          maxItems: 1000,
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <EventsUrlContext.Provider value={config.eventsUrl}>
          {children}
        </EventsUrlContext.Provider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
