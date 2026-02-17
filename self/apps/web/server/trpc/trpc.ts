/**
 * tRPC initialization.
 */
import { initTRPC } from '@trpc/server';
import superjson from 'superjson';
import type { NousContext } from '../context';

export function createTRPCContext(ctx: NousContext): NousContext {
  return ctx;
}

const t = initTRPC.context<NousContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
