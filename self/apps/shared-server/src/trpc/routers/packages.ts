import {
  AppInstallPreparationSchema,
  AppInstallPrepareRequestSchema,
  AppInstallRequestSchema,
  AppInstallResultSchema,
  AppSettingsPreparationSchema,
  AppSettingsPrepareRequestSchema,
  AppSettingsSaveRequestSchema,
  AppSettingsSaveResultSchema,
  AppPanelSafeConfigSnapshotSchema,
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
  config_version: z.string().min(1),
  preserve_state: z.boolean(),
  position: z.enum(['left', 'right', 'bottom', 'main']).optional(),
  config_snapshot: AppPanelSafeConfigSnapshotSchema,
});

export const packagesRouter = router({
  prepareAppInstall: publicProcedure
    .input(AppInstallPrepareRequestSchema)
    .output(AppInstallPreparationSchema)
    .query(async ({ ctx, input }) => {
      return ctx.appInstallService.prepareInstall(input);
    }),
  installApp: publicProcedure
    .input(AppInstallRequestSchema)
    .output(AppInstallResultSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.appInstallService.installApp(input);
    }),
  prepareAppSettings: publicProcedure
    .input(AppSettingsPrepareRequestSchema)
    .output(AppSettingsPreparationSchema)
    .query(async ({ ctx, input }) => {
      return ctx.appSettingsService.prepareSettings(input);
    }),
  saveAppSettings: publicProcedure
    .input(AppSettingsSaveRequestSchema)
    .output(AppSettingsSaveResultSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.appSettingsService.saveSettings(input);
    }),
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
        config_version: panel.config_version,
        preserve_state: panel.preserve_state,
        position: panel.position,
        config_snapshot: panel.config_snapshot,
      }));
    }),
});
