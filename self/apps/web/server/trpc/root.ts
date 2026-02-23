/**
 * tRPC root router.
 */
import { router } from './trpc';
import { projectsRouter } from './routers/projects';
import { chatRouter } from './routers/chat';
import { tracesRouter } from './routers/traces';
import { memoryRouter } from './routers/memory';
import { configRouter } from './routers/config';
import { healthRouter } from './routers/health';
import { firstRunRouter } from './routers/first-run';
import { witnessRouter } from './routers/witness';

export const appRouter = router({
  projects: projectsRouter,
  chat: chatRouter,
  traces: tracesRouter,
  memory: memoryRouter,
  config: configRouter,
  health: healthRouter,
  firstRun: firstRunRouter,
  witness: witnessRouter,
});

export type AppRouter = typeof appRouter;
