/**
 * tRPC vanilla client for CLI.
 * Consumes the same AppRouter as the web UI.
 */
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from './app-router-type.js';

function getAuthHeaders(): Record<string, string> {
  const auth = process.env.NOUS_BASIC_AUTH;
  if (!auth) return {};
  const parts = auth.split(':');
  const user = parts[0] ?? '';
  const pass = parts[1] ?? '';
  const encoded = Buffer.from(`${user}:${pass}`).toString('base64');
  return { Authorization: `Basic ${encoded}` };
}

export function createCliTrpcClient(apiUrl: string): CliTrpcClient {
  const baseUrl = apiUrl.replace(/\/$/, '') + '/api/trpc';
  const client = createTRPCClient({
    links: [
      httpBatchLink({
        url: baseUrl,
        transformer: superjson,
        headers: () => getAuthHeaders(),
      }),
    ],
  });
  return client as unknown as CliTrpcClient;
}

export type CliTrpcClient = AppRouter;
