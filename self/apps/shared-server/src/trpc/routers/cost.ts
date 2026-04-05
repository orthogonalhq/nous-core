/**
 * Cost governance tRPC router — budget policy CRUD + cost queries.
 *
 * Thin delegation layer over CostGovernanceService (sub-phase 1.2).
 * All business logic lives in the service; the router handles:
 *   - Input/output validation via Zod schemas from @nous/shared
 *   - groupBy 'model' mapping (extracts model from composite provider:model keys)
 *   - projectControlState enrichment from opctlService
 */
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import {
  BudgetPolicySchema,
  BudgetStatusSchema,
  CostBreakdownEntrySchema,
  CostTimeSeriesBucketSchema,
  CostSummarySchema,
} from '@nous/shared';
import type { ProjectId } from '@nous/shared';

const projectIdInput = z.object({ projectId: z.string() });
const successOutput = z.object({ success: z.boolean() });

export const costRouter = router({
  getBudgetPolicy: publicProcedure
    .input(projectIdInput)
    .output(BudgetPolicySchema.nullable())
    .query(({ ctx, input }) => {
      return ctx.costGovernanceService.getBudgetPolicy(input.projectId);
    }),

  setBudgetPolicy: publicProcedure
    .input(z.object({ projectId: z.string(), policy: BudgetPolicySchema }))
    .output(successOutput)
    .mutation(({ ctx, input }) => {
      ctx.costGovernanceService.setBudgetPolicy(input.projectId, input.policy);
      return { success: true };
    }),

  removeBudgetPolicy: publicProcedure
    .input(projectIdInput)
    .output(successOutput)
    .mutation(({ ctx, input }) => {
      ctx.costGovernanceService.removeBudgetPolicy(input.projectId);
      return { success: true };
    }),

  getBudgetStatus: publicProcedure
    .input(projectIdInput)
    .output(BudgetStatusSchema)
    .query(async ({ ctx, input }) => {
      const status = ctx.costGovernanceService.getBudgetStatus(input.projectId);
      try {
        const controlState = await ctx.opctlService.getProjectControlState(
          input.projectId as ProjectId,
        );
        status.projectControlState = controlState;
      } catch {
        // Degrade gracefully: keep service default ('running')
      }
      return status;
    }),

  getCostBreakdown: publicProcedure
    .input(z.object({
      projectId: z.string(),
      groupBy: z.enum(['provider', 'model', 'agentClass', 'correlationRoot']),
    }))
    .output(z.array(CostBreakdownEntrySchema))
    .query(({ ctx, input }) => {
      const { projectId, groupBy } = input;

      // 'model' is not a native service groupBy — derive from composite provider:model keys
      if (groupBy === 'model') {
        const compositeEntries = ctx.costGovernanceService.getCostBreakdown(projectId, 'provider');
        const modelMap = new Map<string, {
          totalCostUsd: number;
          inputCostUsd: number;
          outputCostUsd: number;
          eventCount: number;
        }>();

        for (const entry of compositeEntries) {
          // Composite key format: "providerId:modelId" — model may contain colons
          const modelKey = entry.key.split(':').slice(1).join(':');
          const existing = modelMap.get(modelKey);
          if (existing) {
            existing.totalCostUsd += entry.totalCostUsd;
            existing.inputCostUsd += entry.inputCostUsd;
            existing.outputCostUsd += entry.outputCostUsd;
            existing.eventCount += entry.eventCount;
          } else {
            modelMap.set(modelKey, {
              totalCostUsd: entry.totalCostUsd,
              inputCostUsd: entry.inputCostUsd,
              outputCostUsd: entry.outputCostUsd,
              eventCount: entry.eventCount,
            });
          }
        }

        return Array.from(modelMap.entries()).map(([key, data]) => ({
          key,
          ...data,
        }));
      }

      // Direct passthrough for provider, agentClass, correlationRoot
      return ctx.costGovernanceService.getCostBreakdown(projectId, groupBy);
    }),

  getCostTimeSeries: publicProcedure
    .input(z.object({
      projectId: z.string(),
      bucketMinutes: z.number().int().positive().default(60),
    }))
    .output(z.array(CostTimeSeriesBucketSchema))
    .query(({ ctx, input }) => {
      return ctx.costGovernanceService.getCostTimeSeries(input.projectId, input.bucketMinutes);
    }),

  getCostSummary: publicProcedure
    .input(projectIdInput)
    .output(CostSummarySchema)
    .query(({ ctx, input }) => {
      return ctx.costGovernanceService.getCostSummary(input.projectId);
    }),
});
