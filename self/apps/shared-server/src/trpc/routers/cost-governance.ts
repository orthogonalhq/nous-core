/**
 * Cost governance tRPC router — budget status, cost snapshots, pricing management.
 *
 * Exposes query and mutation procedures backed by ICostGovernanceService
 * and IProjectStore for budget policy persistence.
 */
import { z } from 'zod';
import {
  CostWindowSchema,
  CostBudgetPolicySchema,
  ModelPricingEntrySchema,
} from '@nous/shared';
import type { ProjectId } from '@nous/shared';
import { router, publicProcedure } from '../trpc';

export const costGovernanceRouter = router({
  getCostSummary: publicProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
        window: CostWindowSchema,
      }),
    )
    .query(({ ctx, input }) => {
      return ctx.costGovernanceService.getProjectCostSnapshot(
        input.projectId,
        input.window,
      );
    }),

  getBudgetStatus: publicProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .query(({ ctx, input }) => {
      return ctx.costGovernanceService.getBudgetStatus(input.projectId);
    }),

  getProviderBreakdown: publicProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
        window: CostWindowSchema,
      }),
    )
    .query(({ ctx, input }) => {
      return ctx.costGovernanceService.getProviderBreakdown(
        input.projectId,
        input.window,
      );
    }),

  getPricingTable: publicProcedure.query(({ ctx }) => {
    return ctx.costGovernanceService.getPricingTable();
  }),

  setBudgetPolicy: publicProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
        policy: CostBudgetPolicySchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.projectStore.update(
        input.projectId as ProjectId,
        { costBudget: input.policy },
      );
      return { ok: true };
    }),

  setPricingEntry: publicProcedure
    .input(ModelPricingEntrySchema)
    .mutation(({ ctx, input }) => {
      ctx.costGovernanceService.setPricingEntry(input);
      return { ok: true };
    }),

  removePricingEntry: publicProcedure
    .input(
      z.object({
        providerId: z.string().min(1),
        modelId: z.string().min(1),
      }),
    )
    .mutation(({ ctx, input }) => {
      const removed = ctx.costGovernanceService.removePricingEntry(
        input.providerId,
        input.modelId,
      );
      return { ok: true, removed };
    }),
});
