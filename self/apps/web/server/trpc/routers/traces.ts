/**
 * Traces tRPC router.
 */
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { ProjectIdSchema } from '@nous/shared';
import { ExecutionTraceSchema } from '@nous/shared';

const TRACE_COLLECTION = 'execution_traces';

export const tracesRouter = router({
  list: publicProcedure
    .input(
      z.object({
        projectId: ProjectIdSchema.optional(),
        limit: z.number().int().positive().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!input.projectId) return [];
      const raw = await ctx.documentStore.query<Record<string, unknown>>(
        TRACE_COLLECTION,
        {
          where: { projectId: input.projectId },
          orderBy: 'startedAt',
          orderDirection: 'desc',
          limit: input.limit ?? 50,
        },
      );
      const traces: import('@nous/shared').ExecutionTrace[] = [];
      for (const item of raw) {
        const parsed = ExecutionTraceSchema.safeParse(item);
        if (parsed.success) traces.push(parsed.data);
      }
      return traces;
    }),

  get: publicProcedure
    .input(z.object({ traceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.coreExecutor.getTrace(
        input.traceId as import('@nous/shared').TraceId,
      );
    }),
});
