/**
 * Config tRPC router.
 */
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { ProviderIdSchema } from '@nous/shared';

export const configRouter = router({
  get: publicProcedure.query(({ ctx }) => {
    return ctx.config.get();
  }),

  update: publicProcedure
    .input(
      z.object({
        pfcTier: z.number().min(0).max(5).optional(),
        modelRoleAssignments: z
          .array(z.object({ role: z.string(), providerId: ProviderIdSchema }))
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.pfcTier !== undefined) {
        await ctx.config.update('pfcTier' as never, input.pfcTier as never);
      }
      if (input.modelRoleAssignments !== undefined) {
        await ctx.config.update(
          'modelRoleAssignments' as never,
          input.modelRoleAssignments as never,
        );
      }
    }),
});
