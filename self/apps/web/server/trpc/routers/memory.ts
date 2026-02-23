/**
 * Memory tRPC router.
 */
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import {
  ProjectIdSchema,
  MemoryEntryIdSchema,
  MemoryWriteCandidateSchema,
  ExecutionTraceSchema,
} from '@nous/shared';

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

  audit: publicProcedure
    .input(z.object({ projectId: ProjectIdSchema.optional() }))
    .query(async ({ ctx, input }) => {
      return ctx.mwcPipeline.listMutationAudit(input.projectId);
    }),

  tombstones: publicProcedure
    .input(z.object({ projectId: ProjectIdSchema.optional() }))
    .query(async ({ ctx, input }) => {
      return ctx.mwcPipeline.listTombstones(input.projectId);
    }),

  export: publicProcedure
    .input(z.object({ projectId: ProjectIdSchema }))
    .query(async ({ ctx, input }) => {
      return ctx.mwcPipeline.exportForProject(input.projectId);
    }),

  supersede: publicProcedure
    .input(
      z.object({
        id: MemoryEntryIdSchema,
        replacement: MemoryWriteCandidateSchema,
        projectId: ProjectIdSchema.optional(),
        reason: z.string().default('operator supersede entry'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.mwcPipeline.mutate({
        action: 'supersede',
        actor: 'operator',
        targetEntryId: input.id,
        replacementCandidate: input.replacement,
        projectId: input.projectId ?? input.replacement.projectId,
        reason: input.reason,
        traceId: input.replacement.provenance.traceId,
        evidenceRefs: [],
      });
    }),

  promote: publicProcedure
    .input(
      z.object({
        id: MemoryEntryIdSchema,
        reason: z.string().default('operator promote entry'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.mwcPipeline.mutate({
        action: 'promote-global',
        actor: 'operator',
        targetEntryId: input.id,
        reason: input.reason,
        evidenceRefs: [],
      });
    }),

  demote: publicProcedure
    .input(
      z.object({
        id: MemoryEntryIdSchema,
        projectId: ProjectIdSchema,
        reason: z.string().default('operator demote entry'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.mwcPipeline.mutate({
        action: 'demote-project',
        actor: 'operator',
        targetEntryId: input.id,
        projectId: input.projectId,
        reason: input.reason,
        evidenceRefs: [],
      });
    }),

  delete: publicProcedure
    .input(
      z.object({
        id: MemoryEntryIdSchema.optional(),
        projectId: ProjectIdSchema.optional(),
        hard: z.boolean().optional(),
        rationale: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.id) {
        const action = input.hard ? 'hard-delete' : 'soft-delete';
        const result = await ctx.mwcPipeline.mutate({
          action,
          actor: 'operator',
          targetEntryId: input.id,
          projectId: input.projectId,
          reason: input.hard
            ? 'operator hard delete entry'
            : 'operator soft delete entry',
          principalOverride: input.hard && input.rationale
            ? { rationale: input.rationale }
            : undefined,
          evidenceRefs: [],
        });
        return { deleted: result.applied ? 1 : 0, result };
      }
      if (input.projectId) {
        const count = await ctx.mwcPipeline.deleteAllForProject(input.projectId);
        return { deleted: count };
      }
      return { deleted: 0 };
    }),
});
