/**
 * Inference tRPC router — token usage queries.
 *
 * Exposes getTokenUsageSummary and getProviderBreakdown procedures
 * backed by TokenAccumulatorService per ADR 3.
 */
import { router, publicProcedure } from '../trpc';

export const inferenceRouter = router({
  getTokenUsageSummary: publicProcedure.query(({ ctx }) => {
    return ctx.tokenAccumulator.getUsageSummary();
  }),

  getProviderBreakdown: publicProcedure.query(({ ctx }) => {
    return ctx.tokenAccumulator.getProviderBreakdown();
  }),
});
