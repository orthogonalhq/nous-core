import {
  PackageInstallRequestSchema,
  PackageInstallResultSchema,
} from '@nous/shared';
import { publicProcedure, router } from '../trpc';

export const packagesRouter = router({
  install: publicProcedure
    .input(PackageInstallRequestSchema)
    .output(PackageInstallResultSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.packageInstallService.installPackage(input);
    }),
});
