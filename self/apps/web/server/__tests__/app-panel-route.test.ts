import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { clearNousContextCache, createNousContext } from '../bootstrap';
import { GET } from '../../app/apps/[appId]/panels/[panelId]/route';

describe('app panel route', () => {
  afterEach(() => {
    clearNousContextCache();
    vi.restoreAllMocks();
  });

  it('serves the canonical app panel HTML shell with CSP and MCP endpoint injection', async () => {
    process.env.NOUS_DATA_DIR = join(tmpdir(), `nous-web-app-panel-${randomUUID()}`);
    clearNousContextCache();
    const ctx = createNousContext();

    vi.spyOn(ctx.appRuntimeService, 'resolvePanel').mockResolvedValue({
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
    } as any);
    vi.spyOn(ctx.panelTranspiler, 'getTranspiledPanel').mockResolvedValue({
      cache_status: 'miss',
      entry: {
        cache_key: 'cache-key',
        app_id: 'app:weather',
        panel_id: 'forecast',
        session_id: 'session-1',
        package_version: '1.0.0',
        normalized_entry_path: 'panels/forecast.tsx',
        descriptor_fingerprint: 'descriptor-hash',
        source_fingerprint: 'source-hash',
        generated_at: '2026-03-18T00:00:00.000Z',
        bundle_js: 'console.log("forecast");',
        bundle_path: '/repo/.apps/weather/.panel-cache/cache-key.js',
        metadata_path: '/repo/.apps/weather/.panel-cache/cache-key.json',
      },
    });

    const response = await GET(
      new Request('http://localhost:3000/apps/app%3Aweather/panels/forecast'),
      {
        params: Promise.resolve({
          appId: 'app:weather',
          panelId: 'forecast',
        }),
      },
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toBe(
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:",
    );
    expect(response.headers.get('x-nous-panel-cache')).toBe('miss');
    expect(body).toContain('window.__NOUS_MCP_ENDPOINT__="http://localhost:3000/mcp"');
    expect(body).toContain('console.log("forecast");');
  });

  it('fails closed when the app panel is not active', async () => {
    process.env.NOUS_DATA_DIR = join(tmpdir(), `nous-web-app-panel-${randomUUID()}`);
    clearNousContextCache();
    const ctx = createNousContext();
    vi.spyOn(ctx.appRuntimeService, 'resolvePanel').mockResolvedValue(null);

    const response = await GET(
      new Request('http://localhost:3000/apps/app%3Aweather/panels/forecast'),
      {
        params: Promise.resolve({
          appId: 'app:weather',
          panelId: 'forecast',
        }),
      },
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Active app panel not found.');
  });

  it('fails closed when bundle generation throws', async () => {
    process.env.NOUS_DATA_DIR = join(tmpdir(), `nous-web-app-panel-${randomUUID()}`);
    clearNousContextCache();
    const ctx = createNousContext();
    vi.spyOn(ctx.appRuntimeService, 'resolvePanel').mockResolvedValue({
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
    } as any);
    vi.spyOn(ctx.panelTranspiler, 'getTranspiledPanel').mockRejectedValue(
      new Error('bundle failed'),
    );

    const response = await GET(
      new Request('http://localhost:3000/apps/app%3Aweather/panels/forecast'),
      {
        params: Promise.resolve({
          appId: 'app:weather',
          panelId: 'forecast',
        }),
      },
    );

    expect(response.status).toBe(500);
    expect(await response.text()).toBe('App panel bundle generation failed.');
  });
});
