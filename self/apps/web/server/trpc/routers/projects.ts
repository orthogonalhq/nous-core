/**
 * Projects tRPC router.
 */
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { router, publicProcedure } from '../trpc';
import { ProjectIdSchema } from '@nous/shared';

export const projectsRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.projectStore.list();
  }),

  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        type: z.enum(['protocol', 'intent', 'hybrid']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString();
      const id = randomUUID() as import('@nous/shared').ProjectId;
      const config = ctx.config.get() as {
        defaults?: {
          memoryAccessPolicy?: { canReadFrom: string; canBeReadBy: string; inheritsGlobal: boolean };
          escalationChannels?: string[];
        };
      };
      const defaults = config.defaults ?? {};
      const memoryAccessPolicy = (defaults.memoryAccessPolicy &&
        typeof defaults.memoryAccessPolicy === 'object' &&
        'canReadFrom' in defaults.memoryAccessPolicy &&
        'canBeReadBy' in defaults.memoryAccessPolicy &&
        'inheritsGlobal' in defaults.memoryAccessPolicy
        ? defaults.memoryAccessPolicy
        : { canReadFrom: 'all', canBeReadBy: 'all', inheritsGlobal: true }) as {
        canReadFrom: 'all' | 'none';
        canBeReadBy: 'all' | 'none';
        inheritsGlobal: boolean;
      };
      const escalationChannels = (Array.isArray(defaults.escalationChannels)
        ? defaults.escalationChannels
        : ['in-app']) as ('in-app' | 'push' | 'email' | 'signal' | 'slack' | 'sms' | 'voice')[];

      await ctx.projectStore.create({
        id,
        name: input.name,
        type: input.type ?? 'hybrid',
        pfcTier: 3,
        memoryAccessPolicy,
        escalationChannels,
        retrievalBudgetTokens: 500,
        createdAt: now,
        updatedAt: now,
      });

      const created = await ctx.projectStore.get(id);
      if (!created) throw new Error('Project creation failed');
      return created;
    }),

  get: publicProcedure
    .input(z.object({ id: ProjectIdSchema }))
    .query(async ({ ctx, input }) => {
      return ctx.projectStore.get(input.id);
    }),

  update: publicProcedure
    .input(
      z.object({
        id: ProjectIdSchema,
        updates: z.object({
          name: z.string().min(1).optional(),
          pfcTier: z.number().min(0).max(5).optional(),
          modelAssignments: z.record(z.string(), z.string()).optional(),
        }).partial(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.projectStore.update(input.id, input.updates);
    }),
});
