import {
  AppPanelBridgeContextSchema,
  AppPanelLifecycleUpdateSchema,
  AppPanelSafeConfigSnapshotSchema,
  AppPanelRegistrationProjectionSchema,
  type AppConfig,
  type AppHandshakeConfigEntry,
  type AppPanelBridgeContext,
  type AppPanelLifecycleUpdate,
  type AppPanelRegistrationProjection,
  type AppRuntimeSession,
} from '@nous/shared';

export type ResolvedAppPanelDescriptor = AppPanelBridgeContext;

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
        | 'session_id'
        | 'app_id'
        | 'package_id'
        | 'package_version'
        | 'project_id'
        | 'config_version'
      >;
      package_root_ref: string;
      manifest_ref: string;
      manifest_config?: AppConfig;
      config_entries: readonly AppHandshakeConfigEntry[];
      panels: readonly AppPanelRegistrationProjection[];
    },
  ): ResolvedAppPanelDescriptor[] {
    this.unregisterSession(input.session.session_id);

    const parsed = input.panels.map((panel) =>
      AppPanelRegistrationProjectionSchema.parse(panel),
    );
    const configSnapshot = buildPanelSafeConfigSnapshot(
      input.manifest_config,
      input.config_entries,
    );
    const descriptors = parsed.map((panel) => ({
      session_id: input.session.session_id,
      app_id: panel.app_id,
      package_id: input.session.package_id,
      package_version: input.session.package_version,
      config_version: input.session.config_version,
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
      config_snapshot: configSnapshot,
    })).map((descriptor) => AppPanelBridgeContextSchema.parse(descriptor));

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

  updateLifecycle(input: AppPanelLifecycleUpdate): ResolvedAppPanelDescriptor | null {
    const parsed = AppPanelLifecycleUpdateSchema.parse(input);
    const current = this.resolvePanel(parsed.app_id, parsed.panel_id);
    if (!current) {
      return null;
    }

    const next = AppPanelBridgeContextSchema.parse({
      ...current,
      lifecycle: {
        event: parsed.event,
        reason: parsed.reason,
        updated_at: parsed.occurred_at,
      },
    });

    this.panelsByKey.set(
      buildPanelRegistryKey(next.app_id, next.panel_id),
      next,
    );
    this.panelsBySession.set(
      next.session_id,
      (this.panelsBySession.get(next.session_id) ?? []).map((panel) =>
        panel.app_id === next.app_id && panel.panel_id === next.panel_id
          ? next
          : panel,
      ),
    );

    return next;
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

function buildPanelSafeConfigSnapshot(
  manifestConfig: AppConfig | undefined,
  configEntries: readonly AppHandshakeConfigEntry[],
) {
  const snapshot: Record<string, { value: unknown; source: AppHandshakeConfigEntry['source'] }> =
    {};

  for (const entry of configEntries) {
    if (manifestConfig?.[entry.key]?.type === 'secret') {
      continue;
    }

    snapshot[entry.key] = {
      value: entry.value,
      source: entry.source,
    };
  }

  return AppPanelSafeConfigSnapshotSchema.parse(snapshot);
}
