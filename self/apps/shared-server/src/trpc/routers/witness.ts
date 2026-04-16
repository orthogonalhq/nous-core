/**
 * Witness tRPC router.
 */
import { z } from 'zod';
import {
  ExecutionTraceSchema,
  TraceEvidenceReferenceSchema,
  WitnessEventSchema,
  type TraceId,
  type VerificationReport,
  VerificationReportIdSchema,
  WitnessCheckpointReasonSchema,
} from '@nous/shared';
import { router, publicProcedure } from '../trpc';

const TRACE_COLLECTION = 'execution_traces';
const WITNESS_EVENTS_COLLECTION = 'witness_events';

export const witnessRouter = router({
  verify: publicProcedure
    .input(
      z
        .object({
          fromSequence: z.number().int().nonnegative().optional(),
          toSequence: z.number().int().nonnegative().optional(),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      const report = await ctx.witnessService.verify(input);
      await linkVerificationReportToTraces(ctx, report);
      return report;
    }),

  listReports: publicProcedure
    .input(
      z
        .object({
          limit: z.number().int().positive().max(100).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      return ctx.witnessService.listReports(input?.limit ?? 20);
    }),

  getReport: publicProcedure
    .input(
      z.object({
        id: VerificationReportIdSchema,
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.witnessService.getReport(input.id);
    }),

  latestCheckpoint: publicProcedure.query(async ({ ctx }) => {
    return ctx.witnessService.getLatestCheckpoint();
  }),

  createCheckpoint: publicProcedure
    .input(
      z
        .object({
          reason: WitnessCheckpointReasonSchema.optional(),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.witnessService.createCheckpoint(input?.reason);
    }),

  rotateKeyEpoch: publicProcedure.mutation(async ({ ctx }) => {
    return ctx.witnessService.rotateKeyEpoch();
  }),
});

async function linkVerificationReportToTraces(
  ctx: {
    documentStore: import('@nous/shared').IDocumentStore;
    coreExecutor: import('@nous/shared').ICoreExecutor;
  },
  report: VerificationReport,
): Promise<void> {
  const rawEvents = await ctx.documentStore.query<unknown>(
    WITNESS_EVENTS_COLLECTION,
    {
      orderBy: 'sequence',
      orderDirection: 'asc',
    },
  );

  const traceIds = new Set<TraceId>();
  for (const raw of rawEvents) {
    const parsed = WitnessEventSchema.safeParse(raw);
    if (!parsed.success) {
      continue;
    }
    const event = parsed.data;
    if (
      event.sequence >= report.range.fromSequence &&
      event.sequence <= report.range.toSequence &&
      event.actionCategory === 'trace-persist' &&
      event.traceId
    ) {
      traceIds.add(event.traceId);
    }
  }

  for (const traceId of traceIds) {
    const trace = await ctx.coreExecutor.getTrace(traceId);
    if (!trace || trace.turns.length === 0) {
      continue;
    }

    const reportRef = TraceEvidenceReferenceSchema.parse({
      actionCategory: 'trace-persist',
      verificationReportId: report.id,
    });

    let wrote = false;
    const turns = trace.turns.map((turn, index) => {
      if (index !== trace.turns.length - 1) {
        return turn;
      }

      if (
        turn.evidenceRefs.some(
          (ref) => ref.verificationReportId === report.id,
        )
      ) {
        return turn;
      }

      wrote = true;
      return {
        ...turn,
        evidenceRefs: [...turn.evidenceRefs, reportRef],
      };
    });

    if (!wrote) {
      continue;
    }

    const updatedTrace = ExecutionTraceSchema.parse({
      ...trace,
      turns,
    });
    await ctx.documentStore.put(TRACE_COLLECTION, traceId, updatedTrace);
  }
}
