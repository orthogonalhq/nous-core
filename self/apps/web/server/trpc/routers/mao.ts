/**
 * MAO tRPC router — agent and project control projections.
 */
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';

export const maoRouter = router({
  getAgentProjections: publicProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.maoProjectionService.getAgentProjections(
        input.projectId as import('@nous/shared').ProjectId,
      );
    }),

  getProjectControlProjection: publicProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.maoProjectionService.getProjectControlProjection(
        input.projectId as import('@nous/shared').ProjectId,
      );
    }),
});
