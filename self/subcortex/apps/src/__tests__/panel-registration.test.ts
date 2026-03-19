import { describe, expect, it } from 'vitest';
import { PanelRegistrationRegistry } from '../panel-registration.js';

const session = {
  session_id: 'session-1',
  app_id: 'app:weather',
  package_id: 'app:weather',
  package_version: '1.0.0',
  project_id: '550e8400-e29b-41d4-a716-446655440000',
} as const as any;

describe('PanelRegistrationRegistry', () => {
  it('registers panels as host-resolvable runtime descriptors', () => {
    const registry = new PanelRegistrationRegistry();

    const panels = registry.registerPanels({
      session,
      package_root_ref: '/repo/.apps/weather',
      manifest_ref: '/repo/.apps/weather/manifest.json',
      config_entries: [],
      panels: [
        {
          app_id: 'app:weather',
          session_id: 'ignored-by-registry',
          panel_id: 'forecast',
          label: 'Forecast',
          entry: 'panels/forecast.tsx',
          preserve_state: true,
        },
      ],
    });

    expect(panels).toHaveLength(1);
    expect(registry.resolvePanel('app:weather', 'forecast')).toEqual(
      expect.objectContaining({
        session_id: 'session-1',
        package_id: 'app:weather',
        package_version: '1.0.0',
        route_path: '/apps/app%3Aweather/panels/forecast',
        dockview_panel_id: 'app:app:weather:forecast',
      }),
    );
  });

  it('keeps the newest active descriptor when the same app panel is re-registered', () => {
    const registry = new PanelRegistrationRegistry();

    registry.registerPanels({
      session,
      package_root_ref: '/repo/.apps/weather',
      manifest_ref: '/repo/.apps/weather/manifest.json',
      config_entries: [],
      panels: [
        {
          app_id: 'app:weather',
          session_id: 'session-1',
          panel_id: 'forecast',
          label: 'Forecast',
          entry: 'panels/forecast.tsx',
          preserve_state: true,
        },
      ],
    });
    registry.registerPanels({
      session: {
        ...session,
        session_id: 'session-2',
        package_version: '1.1.0',
      },
      package_root_ref: '/repo/.apps/weather-v2',
      manifest_ref: '/repo/.apps/weather-v2/manifest.json',
      config_entries: [],
      panels: [
        {
          app_id: 'app:weather',
          session_id: 'session-2',
          panel_id: 'forecast',
          label: 'Forecast 2',
          entry: 'panels/forecast.tsx',
          preserve_state: true,
        },
      ],
    });

    expect(registry.resolvePanel('app:weather', 'forecast')).toEqual(
      expect.objectContaining({
        session_id: 'session-2',
        package_version: '1.1.0',
        package_root_ref: '/repo/.apps/weather-v2',
      }),
    );

    registry.unregisterSession('session-1');
    expect(registry.resolvePanel('app:weather', 'forecast')).toEqual(
      expect.objectContaining({
        session_id: 'session-2',
      }),
    );
  });

  it('removes stale host state when a session unregisters', () => {
    const registry = new PanelRegistrationRegistry();

    registry.registerPanels({
      session,
      package_root_ref: '/repo/.apps/weather',
      manifest_ref: '/repo/.apps/weather/manifest.json',
      config_entries: [],
      panels: [
        {
          app_id: 'app:weather',
          session_id: 'session-1',
          panel_id: 'forecast',
          label: 'Forecast',
          entry: 'panels/forecast.tsx',
          preserve_state: true,
        },
      ],
    });

    const removed = registry.unregisterSession('session-1');

    expect(removed).toHaveLength(1);
    expect(registry.resolvePanel('app:weather', 'forecast')).toBeNull();
    expect(registry.listPanels()).toEqual([]);
  });

  it('omits secret config fields from the bridge snapshot', () => {
    const registry = new PanelRegistrationRegistry();

    registry.registerPanels({
      session,
      package_root_ref: '/repo/.apps/weather',
      manifest_ref: '/repo/.apps/weather/manifest.json',
      manifest_config: {
        units: {
          type: 'string',
          required: false,
        },
        api_key: {
          type: 'secret',
          required: false,
        },
      },
      config_entries: [
        {
          key: 'units',
          value: 'metric',
          source: 'project_config',
          mutable: false,
        },
        {
          key: 'api_key',
          value: 'secret-token',
          source: 'project_config',
          mutable: false,
        },
      ],
      panels: [
        {
          app_id: 'app:weather',
          session_id: 'session-1',
          panel_id: 'forecast',
          label: 'Forecast',
          entry: 'panels/forecast.tsx',
          preserve_state: true,
        },
      ],
    });

    expect(registry.resolvePanel('app:weather', 'forecast')).toEqual(
      expect.objectContaining({
        config_snapshot: {
          units: {
            value: 'metric',
            source: 'project_config',
          },
        },
      }),
    );
    expect(
      registry.resolvePanel('app:weather', 'forecast')?.config_snapshot.api_key,
    ).toBeUndefined();
  });

  it('updates the canonical lifecycle projection for active panels', () => {
    const registry = new PanelRegistrationRegistry();

    registry.registerPanels({
      session,
      package_root_ref: '/repo/.apps/weather',
      manifest_ref: '/repo/.apps/weather/manifest.json',
      config_entries: [],
      panels: [
        {
          app_id: 'app:weather',
          session_id: 'session-1',
          panel_id: 'forecast',
          label: 'Forecast',
          entry: 'panels/forecast.tsx',
          preserve_state: true,
        },
      ],
    });

    const updated = registry.updateLifecycle({
      app_id: 'app:weather',
      panel_id: 'forecast',
      event: 'panel_mount',
      reason: 'activate',
      occurred_at: '2026-03-18T00:00:00.000Z',
    });

    expect(updated?.lifecycle).toEqual({
      event: 'panel_mount',
      reason: 'activate',
      updated_at: '2026-03-18T00:00:00.000Z',
    });
  });
});
