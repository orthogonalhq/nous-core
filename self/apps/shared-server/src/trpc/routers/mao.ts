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

  getProjectSnapshot: publicProcedure
    .input(MaoProjectSnapshotInputSchema)
    .query(async ({ ctx, input }) => {
      return ctx.maoProjectionService.getProjectSnapshot(input);
    }),

  getAgentInspectProjection: publicProcedure
    .input(MaoAgentInspectInputSchema)
    .query(async ({ ctx, input }) => {
      return ctx.maoProjectionService.getAgentInspectProjection(input);
    }),

  getRunGraphSnapshot: publicProcedure
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

  getControlAuditHistory: publicProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.maoProjectionService.getControlAuditHistory(
        input.projectId as import('@nous/shared').ProjectId,
      );
    }),

  getSystemSnapshot: publicProcedure
    .input(MaoSystemSnapshotInputSchema)
    .query(async ({ ctx, input }) => {
      return ctx.maoProjectionService.getSystemSnapshot(input);
    }),
});
