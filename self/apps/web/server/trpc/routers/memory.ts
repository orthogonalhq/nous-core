/**
 * Memory tRPC router.
 */
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { ProjectIdSchema, MemoryEntryIdSchema } from '@nous/shared';
import { ExecutionTraceSchema } from '@nous/shared';

const TRACE_COLLECTION = 'execution_traces';

export const memoryRouter = router({
  list: publicProcedure
    .input(z.object({ projectId: ProjectIdSchema }))
    .query(async ({ ctx, input }) => {
      return ctx.mwcPipeline.listForProject(input.projectId);
    }),

  denials: publicProcedure
    .input(z.object({ projectId: ProjectIdSchema }))
    .query(async ({ ctx, input }) => {
      const raw = await ctx.documentStore.query<Record<string, unknown>>(
        TRACE_COLLECTION,
        { where: { projectId: input.projectId } },
      );
      const denials: Array<{ candidate: unknown; reason: string }> = [];
      for (const item of raw) {
        const parsed = ExecutionTraceSchema.safeParse(item);
        if (!parsed.success) continue;
        for (const turn of parsed.data.turns) {
          for (const d of turn.memoryDenials) {
            denials.push({ candidate: d.candidate, reason: d.reason });
          }
        }
      }
      return denials;
    }),

  export: publicProcedure
    .input(z.object({ projectId: ProjectIdSchema }))
    .query(async ({ ctx, input }) => {
      return ctx.mwcPipeline.exportForProject(input.projectId);
    }),

  delete: publicProcedure
    .input(
      z.object({
        id: MemoryEntryIdSchema.optional(),
        projectId: ProjectIdSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.id) {
        const ok = await ctx.mwcPipeline.deleteEntry(input.id);
        return { deleted: ok ? 1 : 0 };
      }
      if (input.projectId) {
        const count = await ctx.mwcPipeline.deleteAllForProject(input.projectId);
        return { deleted: count };
      }
      return { deleted: 0 };
    }),
});
