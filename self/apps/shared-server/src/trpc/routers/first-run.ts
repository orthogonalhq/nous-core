/**
 * First-run tRPC router.
 */
import { router, publicProcedure } from '../trpc';
import { isFirstRunComplete, markFirstRunComplete } from '../../first-run';

export const firstRunRouter = router({
  status: publicProcedure.query(async ({ ctx }) => {
    const complete = await isFirstRunComplete(
      ctx.dataDir,
      ctx.projectStore,
    );
    return { complete };
  }),

  complete: publicProcedure.mutation(({ ctx }) => {
    markFirstRunComplete(ctx.dataDir);
  }),
});
