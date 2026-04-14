/**
 * Notifications tRPC router.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { NotificationFilterSchema, RaiseNotificationInputSchema } from '@nous/shared';
import { router, publicProcedure } from '../trpc';

export const notificationsRouter = router({
  raise: publicProcedure
    .input(RaiseNotificationInputSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.notificationService.raise(input);
    }),

  list: publicProcedure
    .input(NotificationFilterSchema)
    .query(async ({ ctx, input }) => {
      return ctx.notificationService.list(input);
    }),

  get: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.notificationService.get(input.id);
    }),

  acknowledge: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.notificationService.acknowledge(input.id);
      } catch {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Notification ${input.id} not found`,
        });
      }
    }),

  dismiss: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.notificationService.dismiss(input.id);
      } catch {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Notification ${input.id} not found`,
        });
      }
    }),

  countActive: publicProcedure
    .input(z.object({ projectId: z.string().min(1).optional() }))
    .query(async ({ ctx, input }) => {
      return ctx.notificationService.countActive(input.projectId);
    }),
});
