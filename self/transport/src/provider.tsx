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
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: config.trpcUrl,
          transformer: superjson,
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
