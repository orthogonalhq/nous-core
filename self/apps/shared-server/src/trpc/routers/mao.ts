/**
 * MAO tRPC router — canonical MAO snapshot, inspect, graph, and control flows.
 */
import { z } from 'zod';
import {
  MaoAgentInspectInputSchema,
  MaoProjectControlRequestSchema,
  MaoProjectSnapshotInputSchema,
  MaoSystemSnapshotInputSchema,
  ConfirmationProofSchema,
} from '@nous/shared';
import type { IReadEventBus } from '@nous/shared';
import { router, publicProcedure } from '../trpc';

// SP 1.18 Fix #4 (b.2) — typed-context narrow for .query() handlers.
// Narrows ctx.eventBus from IEventBus to IReadEventBus; a future
// .query() handler that tries ctx.eventBus.publish(...) fails to typecheck.
// Mutation handlers continue to use `publicProcedure` and receive the full IEventBus.
const readProcedure = publicProcedure.use(({ ctx, next }) =>
  next({ ctx: { ...ctx, eventBus: ctx.eventBus as IReadEventBus } }),
);

export const maoRouter = router({
  getAgentProjections: readProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.maoProjectionService.getAgentProjections(
        input.projectId as import('@nous/shared').ProjectId,
      );
    }),

  getProjectControlProjection: readProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.maoProjectionService.getProjectControlProjection(
        input.projectId as import('@nous/shared').ProjectId,
      );
    }),

  getProjectSnapshot: readProcedure
    .input(MaoProjectSnapshotInputSchema)
    .query(async ({ ctx, input }) => {
      return ctx.maoProjectionService.getProjectSnapshot(input);
    }),

  getAgentInspectProjection: readProcedure
    .input(MaoAgentInspectInputSchema)
    .query(async ({ ctx, input }) => {
      return ctx.maoProjectionService.getAgentInspectProjection(input);
    }),

  getRunGraphSnapshot: readProcedure
    .input(MaoProjectSnapshotInputSchema)
    .query(async ({ ctx, input }) => {
      return ctx.maoProjectionService.getRunGraphSnapshot(input);
    }),

  requestProjectControl: publicProcedure
    .input(
      z.object({
        request: MaoProjectControlRequestSchema,
        confirmationProof: ConfirmationProofSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.maoProjectionService.requestProjectControl(
        input.request,
        input.confirmationProof,
      );
    }),

  getControlAuditHistory: readProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.maoProjectionService.getControlAuditHistory(
        input.projectId as import('@nous/shared').ProjectId,
      );
    }),

  getSystemSnapshot: readProcedure
    .input(MaoSystemSnapshotInputSchema)
    .query(async ({ ctx, input }) => {
      return ctx.maoProjectionService.getSystemSnapshot(input);
    }),
});
