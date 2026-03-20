/**
 * Escalations tRPC router.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  AcknowledgeInAppEscalationInputSchema,
  EscalationIdSchema,
  ProjectEscalationQueueSnapshotSchema,
  ProjectIdSchema,
} from '@nous/shared';
import { router, publicProcedure } from '../trpc';

export const escalationsRouter = router({
  listProjectQueue: publicProcedure
    .input(z.object({ projectId: ProjectIdSchema }))
    .query(async ({ ctx, input }) => {
      const items = await ctx.escalationService.listProjectQueue(input.projectId);
      const openCount = items.filter((item) =>
        ['queued', 'visible', 'delivery_degraded'].includes(item.status),
      ).length;
      const acknowledgedCount = items.filter(
        (item) => item.status === 'acknowledged' || item.status === 'resolved',
      ).length;
      const urgentCount = items.filter((item) =>
        ['high', 'critical'].includes(item.severity),
      ).length;

      return ProjectEscalationQueueSnapshotSchema.parse({
        projectId: input.projectId,
        items,
        openCount,
        acknowledgedCount,
        urgentCount,
      });
    }),

  get: publicProcedure
    .input(z.object({ escalationId: EscalationIdSchema }))
    .query(async ({ ctx, input }) => {
      return ctx.escalationService.get(input.escalationId);
    }),

  acknowledge: publicProcedure
    .input(AcknowledgeInAppEscalationInputSchema)
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.escalationService.acknowledge(input);
      if (!updated) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Escalation ${input.escalationId} not found`,
        });
      }
      return updated;
    }),
});
