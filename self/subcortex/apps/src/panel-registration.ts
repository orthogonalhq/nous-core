import {
  AppPanelRegistrationProjectionSchema,
  type AppPanelRegistrationProjection,
  type AppRuntimeSession,
} from '@nous/shared';

export interface ResolvedAppPanelDescriptor {
  session_id: string;
  app_id: string;
  package_id: string;
  package_version: string;
  project_id?: string;
  panel_id: string;
  label: string;
  entry: string;
  position?: AppPanelRegistrationProjection['position'];
  preserve_state: boolean;
  package_root_ref: string;
  manifest_ref: string;
  route_path: string;
  dockview_panel_id: string;
}

function buildPanelRegistryKey(appId: string, panelId: string): string {
  return `${appId}::${panelId}`;
}

function buildRoutePath(appId: string, panelId: string): string {
  return `/apps/${encodeURIComponent(appId)}/panels/${encodeURIComponent(panelId)}`;
}

function buildDockviewPanelId(appId: string, panelId: string): string {
  return `app:${appId}:${panelId}`;
}

export class PanelRegistrationRegistry {
  private readonly panelsBySession = new Map<string, ResolvedAppPanelDescriptor[]>();
  private readonly panelsByKey = new Map<string, ResolvedAppPanelDescriptor>();

  registerPanels(
    input: {
      session: Pick<
        AppRuntimeSession,
        'session_id' | 'app_id' | 'package_id' | 'package_version' | 'project_id'
      >;
      package_root_ref: string;
      manifest_ref: string;
      panels: readonly AppPanelRegistrationProjection[];
    },
  ): ResolvedAppPanelDescriptor[] {
    this.unregisterSession(input.session.session_id);

    const parsed = input.panels.map((panel) =>
      AppPanelRegistrationProjectionSchema.parse(panel),
    );
    const descriptors = parsed.map((panel) => ({
      session_id: input.session.session_id,
      app_id: panel.app_id,
      package_id: input.session.package_id,
      package_version: input.session.package_version,
      project_id: input.session.project_id,
      panel_id: panel.panel_id,
      label: panel.label,
      entry: panel.entry,
      position: panel.position,
      preserve_state: panel.preserve_state,
      package_root_ref: input.package_root_ref,
      manifest_ref: input.manifest_ref,
      route_path: buildRoutePath(panel.app_id, panel.panel_id),
      dockview_panel_id: buildDockviewPanelId(panel.app_id, panel.panel_id),
    }));

    for (const descriptor of descriptors) {
      this.panelsByKey.set(
        buildPanelRegistryKey(descriptor.app_id, descriptor.panel_id),
        descriptor,
      );
    }

    this.panelsBySession.set(input.session.session_id, descriptors);
    return descriptors;
  }

  listSessionPanels(sessionId: string): ResolvedAppPanelDescriptor[] {
    return this.panelsBySession.get(sessionId) ?? [];
  }

  listPanels(): ResolvedAppPanelDescriptor[] {
    return [...this.panelsByKey.values()].sort((left, right) =>
      left.dockview_panel_id.localeCompare(right.dockview_panel_id),
    );
  }

  resolvePanel(appId: string, panelId: string): ResolvedAppPanelDescriptor | null {
    return this.panelsByKey.get(buildPanelRegistryKey(appId, panelId)) ?? null;
  }

  unregisterSession(sessionId: string): ResolvedAppPanelDescriptor[] {
    const panels = this.panelsBySession.get(sessionId) ?? [];
    for (const panel of panels) {
      const key = buildPanelRegistryKey(panel.app_id, panel.panel_id);
      if (this.panelsByKey.get(key)?.session_id === sessionId) {
        this.panelsByKey.delete(key);
      }
    }
    this.panelsBySession.delete(sessionId);
    return panels;
  }
}
