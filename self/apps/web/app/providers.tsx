'use client';

/**
 * React providers for the web app shell.
 *
 * Uses TransportProvider from @nous/transport to set up tRPC + React Query
 * with web-appropriate URLs (relative paths).
 */
import { useState } from 'react';
import { TransportProvider, createWebTransport } from '@nous/transport';

function getBaseUrl() {
  if (typeof window !== 'undefined') return '';
  const defaultPort = process.env.NOUS_WEB_PORT ?? '4317';
  return process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${defaultPort}`;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [config] = useState(() => createWebTransport(getBaseUrl()));

  return (
    <TransportProvider config={config}>
      {children}
    </TransportProvider>
  );
}
