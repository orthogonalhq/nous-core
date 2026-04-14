/**
 * System Activity tRPC router.
 *
 * Provides read-only query procedures for system backlog entries,
 * analytics, status, gateway health, escalation audit, and checkpoint status.
 */
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';

/** Inline enum to avoid cross-package Zod instance mismatch with @nous/cortex-core */
const BacklogEntryStatusFilter = z.enum(['queued', 'active', 'completed', 'suspended', 'failed']);

export const systemActivityRouter = router({
  backlogEntries: publicProcedure
    .input(z.object({ status: BacklogEntryStatusFilter.optional() }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.gatewayRuntime.listBacklogEntries(input ?? undefined);
    }),

  backlogAnalytics: publicProcedure.query(({ ctx }) => {
    const status = ctx.healthAggregator.getSystemStatus();
    return status.backlogAnalytics;
  }),

  systemStatus: publicProcedure.query(({ ctx }) => {
    return ctx.healthAggregator.getSystemStatus();
  }),

  gatewayHealth: publicProcedure.query(({ ctx }) => {
    return ctx.healthAggregator.getAgentStatus();
  }),

  escalationAudit: publicProcedure.query(({ ctx }) => {
    return ctx.gatewayRuntime.getEscalationAuditSummary();
  }),

  checkpointStatus: publicProcedure.query(({ ctx }) => {
    return ctx.gatewayRuntime.getCheckpointStatus();
  }),
});
