/**
 * Chat tRPC router.
 */
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure } from '../trpc';
import { ProjectIdSchema, CardActionSchema } from '@nous/shared';
import type { TraceId } from '@nous/shared';

export const chatRouter = router({
  sendMessage: publicProcedure
    .input(
      z.object({
        message: z.string(),
        projectId: ProjectIdSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const traceId = randomUUID() as TraceId;
      const result = await ctx.gatewayRuntime.handleChatTurn({
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

  sendAction: publicProcedure
    .input(
      z.object({
        action: CardActionSchema,
        projectId: ProjectIdSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { action, projectId } = input;

      switch (action.actionType) {
        case 'followup': {
          const traceId = randomUUID() as TraceId;
          const result = await ctx.gatewayRuntime.handleChatTurn({
            message: String(action.payload.prompt),
            projectId,
            traceId,
          });
          return {
            ok: true as const,
            message: result.response,
            traceId: result.traceId,
            contentType: result.contentType,
          };
        }

        case 'approve':
        case 'reject':
        case 'submit': {
          const receipt = await ctx.gatewayRuntime.submitTaskToSystem({
            task: `Card action: ${action.actionType}`,
            projectId,
            detail: { cardAction: action },
          });
          return {
            ok: true as const,
            message: 'Action submitted',
            traceId: receipt.runId,
          };
        }

        case 'navigate':
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Navigate actions must be handled client-side',
          });
      }
    }),
});
