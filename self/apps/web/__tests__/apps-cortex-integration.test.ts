/**
 * Apps → cortex integration test.
 * Proves: procedures (chat, projects, config) → core executor → full cycle.
 * Uses createCaller to invoke procedures server-side without HTTP.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createNousContext, clearNousContextCache } from '../server/bootstrap';
import { appRouter } from '../server/trpc/root';

describe('apps → cortex integration', () => {
  beforeAll(async () => {
    process.env.NOUS_DATA_DIR = join(
      tmpdir(),
      `nous-apps-cortex-${randomUUID()}`,
    );
    clearNousContextCache();
  });

  it('projects list → create → chat sendMessage → config get', async () => {
    const ctx = createNousContext();
    expect(ctx.gatewayRuntime.getBootSnapshot().status).toBe('ready');
    const caller = appRouter.createCaller(ctx);

    // projects.list
    const initialList = await caller.projects.list();
    expect(Array.isArray(initialList)).toBe(true);

    // projects.create (caller uses direct call for mutations)
    const created = await caller.projects.create({
      name: 'Integration Test Project',
    });
    expect(created).toBeDefined();
    expect(created.id).toBeDefined();
    expect(created.name).toBe('Integration Test Project');

    // chat.sendMessage (caller uses direct call for mutations)
    const chatResult = await caller.chat.sendMessage({
      message: 'Hello, integration test',
      projectId: created.id,
    });
    expect(chatResult.response).toBeDefined();
    expect(typeof chatResult.response).toBe('string');
    expect(chatResult.traceId).toBeDefined();

    // config.get (caller uses direct call for queries)
    const config = await caller.config.get();
    expect(config).toBeDefined();
    expect(typeof config.pfcTier).toBe('number');

    vi.spyOn(ctx.appRuntimeService, 'listPanels').mockResolvedValue([
      {
        session_id: 'session-1',
        app_id: 'app:weather',
        package_id: 'app:weather',
        package_version: '1.0.0',
        panel_id: 'forecast',
        label: 'Forecast',
        entry: 'panels/forecast.tsx',
        preserve_state: true,
        package_root_ref: '/repo/.apps/weather',
        manifest_ref: '/repo/.apps/weather/manifest.json',
        route_path: '/apps/app%3Aweather/panels/forecast',
        dockview_panel_id: 'app:app:weather:forecast',
      },
    ] as any);

    const panels = await caller.packages.listAppPanels();
    expect(panels).toEqual([
      {
        app_id: 'app:weather',
        panel_id: 'forecast',
        label: 'Forecast',
        route_path: '/apps/app%3Aweather/panels/forecast',
        dockview_panel_id: 'app:app:weather:forecast',
        preserve_state: true,
      },
    ]);
  });
});
