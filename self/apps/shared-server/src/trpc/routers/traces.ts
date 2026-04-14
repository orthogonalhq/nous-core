/**
 * Traces tRPC router.
 */
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import {
  ExecutionTraceSchema,
  ProjectIdSchema,
  VerificationReportIdSchema,
} from '@nous/shared';

const TRACE_COLLECTION = 'execution_traces';

export const tracesRouter = router({
  list: publicProcedure
    .input(
      z.object({
        projectId: ProjectIdSchema.optional(),
        limit: z.number().int().positive().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!input.projectId) return [];
      const raw = await ctx.documentStore.query<Record<string, unknown>>(
        TRACE_COLLECTION,
        {
          where: { projectId: input.projectId },
          orderBy: 'startedAt',
          orderDirection: 'desc',
          limit: input.limit ?? 50,
        },
      );
      const traces: import('@nous/shared').ExecutionTrace[] = [];
      for (const item of raw) {
        const parsed = ExecutionTraceSchema.safeParse(item);
        if (parsed.success) traces.push(parsed.data);
      }
      return traces;
    }),

  get: publicProcedure
    .input(z.object({ traceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.coreExecutor.getTrace(
        input.traceId as import('@nous/shared').TraceId,
      );
    }),

  verificationReports: publicProcedure
    .input(z.object({ traceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const trace = await ctx.coreExecutor.getTrace(
        input.traceId as import('@nous/shared').TraceId,
      );
      if (!trace) {
        return [];
      }

      const reportIds = new Set<import('@nous/shared').VerificationReportId>();
      for (const turn of trace.turns) {
        for (const evidenceRef of turn.evidenceRefs) {
          if (!evidenceRef.verificationReportId) {
            continue;
          }
          const parsedId = VerificationReportIdSchema.safeParse(
            evidenceRef.verificationReportId,
          );
          if (parsedId.success) {
            reportIds.add(parsedId.data);
          }
        }
      }

      const reports: import('@nous/shared').VerificationReport[] = [];
      for (const reportId of reportIds) {
        const report = await ctx.witnessService.getReport(reportId);
        if (report) {
          reports.push(report);
        }
      }

      return reports;
    }),
});
