/**
 * tRPC API route handler.
 */
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createTRPCContext } from '@nous/shared-server';
import { initializeNousContext } from '@/server/bootstrap';
import { appRouter } from '@/server/trpc/root';

const handler = async (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: async () => createTRPCContext(await initializeNousContext()),
  });

export { handler as GET, handler as POST };
