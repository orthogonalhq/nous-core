/**
 * GTM tRPC router — stage gate report.
 */
import { z } from 'zod';
import { GtmGateReportInputSchema } from '@nous/shared';
import { router, publicProcedure } from '../trpc';

export const gtmRouter = router({
  computeGateReport: publicProcedure
    .input(GtmGateReportInputSchema)
    .query(async ({ ctx, input }) => {
      return ctx.gtmGateCalculator.computeGateReport(input);
    }),
});
