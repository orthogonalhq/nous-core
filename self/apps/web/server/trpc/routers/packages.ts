import {
  PackageInstallRequestSchema,
  PackageInstallResultSchema,
} from '@nous/shared';
import type { ResolvedAppPanelDescriptor } from '@nous/subcortex-apps';
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

const AppHostPanelSchema = z.object({
  app_id: z.string().min(1),
  panel_id: z.string().min(1),
  label: z.string().min(1),
  route_path: z.string().min(1),
  dockview_panel_id: z.string().min(1),
  preserve_state: z.boolean(),
  position: z.enum(['left', 'right', 'bottom', 'main']).optional(),
});

export const packagesRouter = router({
  install: publicProcedure
    .input(PackageInstallRequestSchema)
    .output(PackageInstallResultSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.packageInstallService.installPackage(input);
    }),
  listAppPanels: publicProcedure
    .output(z.array(AppHostPanelSchema))
    .query(async ({ ctx }) => {
      const panels = await ctx.appRuntimeService.listPanels();
      return panels.map((panel: ResolvedAppPanelDescriptor) => ({
        app_id: panel.app_id,
        panel_id: panel.panel_id,
        label: panel.label,
        route_path: panel.route_path,
        dockview_panel_id: panel.dockview_panel_id,
        preserve_state: panel.preserve_state,
        position: panel.position,
      }));
    }),
});
