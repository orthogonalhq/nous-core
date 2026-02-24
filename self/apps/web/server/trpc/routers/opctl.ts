/**
 * Opctl tRPC router — operator control command submission and confirmation proof.
 */
import { z } from 'zod';
import {
  ControlCommandEnvelopeSchema,
  ConfirmationProofSchema,
  ConfirmationProofRequestSchema,
} from '@nous/shared';
import { router, publicProcedure } from '../trpc';

export const opctlRouter = router({
  submitCommand: publicProcedure
    .input(
      z.object({
        envelope: ControlCommandEnvelopeSchema,
        confirmationProof: ConfirmationProofSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.opctlService.submitCommand(
        input.envelope,
        input.confirmationProof,
      );
    }),

  requestConfirmationProof: publicProcedure
    .input(ConfirmationProofRequestSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.opctlService.requestConfirmationProof(input);
    }),

  hasStartLock: publicProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.opctlService.hasStartLock(
        input.projectId as import('@nous/shared').ProjectId,
      );
    }),
});
