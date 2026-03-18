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
});
