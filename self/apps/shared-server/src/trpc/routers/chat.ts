/**
 * Chat tRPC router.
 */
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { router, publicProcedure } from '../trpc';
import { ProjectIdSchema } from '@nous/shared';

export const chatRouter = router({
  sendMessage: publicProcedure
    .input(
      z.object({
        message: z.string(),
        projectId: ProjectIdSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const traceId = randomUUID() as import('@nous/shared').TraceId;
      const result = await ctx.coreExecutor.executeTurn({
        message: input.message,
        projectId: input.projectId,
        traceId,
      });

      return { response: result.response, traceId: result.traceId, contentType: result.contentType };
    }),

  getHistory: publicProcedure
    .input(z.object({ projectId: ProjectIdSchema.optional() }))
    .query(async ({ ctx, input }) => {
      if (!input.projectId) {
        return { entries: [], summary: undefined, tokenCount: 0 };
      }
      return ctx.stmStore.getContext(input.projectId);
    }),
});
