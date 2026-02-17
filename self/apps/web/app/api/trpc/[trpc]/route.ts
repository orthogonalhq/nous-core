/**
 * tRPC API route handler.
 */
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createNousContext } from '@/server/bootstrap';
import { appRouter } from '@/server/trpc/root';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createNousContext(),
  });

export { handler as GET, handler as POST };
