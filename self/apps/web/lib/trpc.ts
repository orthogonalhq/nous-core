'use client';

/**
 * tRPC React client — re-exported from @nous/transport.
 *
 * Existing web app consumers import from '@/lib/trpc'. This module
 * delegates to the canonical instance in @nous/transport so that
 * a single createTRPCReact instance is shared across the app.
 */
export { trpc } from '@nous/transport';
