/**
 * tRPC React client typed against AppRouter.
 *
 * All UI components import `trpc` from `@nous/transport` — never from
 * `@trpc/*` directly. This keeps the transport binding swappable.
 */
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@nous/shared-server';

export const trpc = createTRPCReact<AppRouter>();

export type { AppRouter };
