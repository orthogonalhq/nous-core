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
        sessionId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const traceId = randomUUID() as TraceId;
      const sessionId = input.sessionId ?? randomUUID();
      const result = await ctx.gatewayRuntime.handleChatTurn({
        message: input.message,
        projectId: input.projectId,
        traceId,
        sessionId,
        scope: 'principal' as const,
      });

      return { response: result.response, traceId: result.traceId, contentType: result.contentType, thinkingContent: result.thinkingContent };
    }),

  getHistory: publicProcedure
    .input(z.object({
      projectId: ProjectIdSchema.optional(),
      sessionId: z.string().uuid().optional(),
    }))
    .query(async ({ ctx, input }) => {
      if (!input.projectId) {
        return { entries: [], summary: undefined, tokenCount: 0 };
      }
      const context = await ctx.stmStore.getContext(input.projectId);
      if (!input.sessionId) return context;
      return {
        ...context,
        entries: context.entries.filter(
          (e: any) => e.metadata?.sessionId === input.sessionId,
        ),
      };
    }),

  listSessions: publicProcedure
    .input(z.object({ projectId: ProjectIdSchema.optional() }))
    .query(async ({ ctx, input }) => {
      if (!input.projectId) return [];
      const context = await ctx.stmStore.getContext(input.projectId);
      const sessionMap = new Map<string, {
        sessionId: string;
        scope: string;
        firstMessage: string;
        lastTimestamp: string;
      }>();
      for (const entry of context.entries) {
        const meta = entry.metadata as Record<string, unknown> | undefined;
        const sid = meta?.sessionId as string | undefined;
        if (!sid) continue;
        const existing = sessionMap.get(sid);
        if (!existing) {
          sessionMap.set(sid, {
            sessionId: sid,
            scope: (meta?.scope as string) ?? 'principal',
            firstMessage: entry.role === 'user' ? entry.content : '',
            lastTimestamp: entry.timestamp,
          });
        } else {
          if (entry.timestamp > existing.lastTimestamp) {
            existing.lastTimestamp = entry.timestamp;
          }
          if (!existing.firstMessage && entry.role === 'user') {
            existing.firstMessage = entry.content;
          }
        }
      }
      return Array.from(sessionMap.values())
        .sort((a, b) => b.lastTimestamp.localeCompare(a.lastTimestamp));
    }),

  sendAction: publicProcedure
    .input(
      z.object({
        action: CardActionSchema,
        projectId: ProjectIdSchema.optional(),
        sessionId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { action, projectId } = input;

      switch (action.actionType) {
        case 'followup': {
          const traceId = randomUUID() as TraceId;
          const sessionId = input.sessionId ?? randomUUID();
          const result = await ctx.gatewayRuntime.handleChatTurn({
            message: String(action.payload.prompt),
            projectId,
            traceId,
            sessionId,
            scope: 'principal' as const,
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
