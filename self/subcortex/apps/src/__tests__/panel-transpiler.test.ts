import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { PanelTranspiler } from '../panel-transpiler.js';
import type { ResolvedAppPanelDescriptor } from '../panel-registration.js';

async function createPanelDescriptor(
  overrides: Partial<ResolvedAppPanelDescriptor> = {},
): Promise<ResolvedAppPanelDescriptor> {
  const packageRoot = await mkdtemp(join(tmpdir(), 'nous-panel-transpiler-'));
  const entryPath = join(packageRoot, 'panels', 'forecast.tsx');
  await mkdir(join(packageRoot, 'panels'), { recursive: true });
  await writeFile(entryPath, 'export default function Forecast() { return null; }', 'utf8');

  return {
    session_id: 'session-1',
    app_id: 'app:weather',
    package_id: 'app:weather',
    package_version: '1.0.0',
    panel_id: 'forecast',
    label: 'Forecast',
    entry: 'panels/forecast.tsx',
    config_version: '1',
    preserve_state: true,
    package_root_ref: packageRoot,
    manifest_ref: join(packageRoot, 'manifest.json'),
    route_path: '/apps/app%3Aweather/panels/forecast',
    dockview_panel_id: 'app:app:weather:forecast',
    config_snapshot: {},
    ...overrides,
  };
}

describe('PanelTranspiler', () => {
  it('reuses the same deterministic cache entry for equivalent input', async () => {
    const descriptor = await createPanelDescriptor();
    const bundle = vi.fn().mockResolvedValue('console.log("forecast")');
    const transpiler = new PanelTranspiler({
      now: () => '2026-03-18T00:00:00.000Z',
      bundle,
    });

    const first = await transpiler.getTranspiledPanel(descriptor);
    const second = await transpiler.getTranspiledPanel(descriptor);

    expect(first.cache_status).toBe('miss');
    expect(second.cache_status).toBe('hit');
    expect(first.entry.cache_key).toBe(second.entry.cache_key);
    expect(bundle).toHaveBeenCalledTimes(1);
  });

  it('invalidates the cache when the panel source changes', async () => {
    const descriptor = await createPanelDescriptor();
    const bundle = vi
      .fn()
      .mockResolvedValueOnce('console.log("forecast-v1")')
      .mockResolvedValueOnce('console.log("forecast-v2")');
    const transpiler = new PanelTranspiler({ bundle });

    const first = await transpiler.getTranspiledPanel(descriptor);
    await writeFile(
      join(descriptor.package_root_ref, 'panels', 'forecast.tsx'),
      'export default function Forecast() { return "v2"; }',
      'utf8',
    );
    const second = await transpiler.getTranspiledPanel(descriptor);

    expect(first.entry.cache_key).not.toBe(second.entry.cache_key);
    expect(second.cache_status).toBe('miss');
    expect(bundle).toHaveBeenCalledTimes(2);
  });

  it('rejects path traversal outside the package root', async () => {
    const descriptor = await createPanelDescriptor({
      entry: '../escape.tsx',
    });
    const transpiler = new PanelTranspiler({
      bundle: vi.fn(),
    });

    await expect(transpiler.getTranspiledPanel(descriptor)).rejects.toThrow(
      'entry escapes the package root',
    );
  });

  it('removes session-owned cache entries during invalidation', async () => {
    const descriptor = await createPanelDescriptor();
    const transpiler = new PanelTranspiler({
      bundle: vi.fn().mockResolvedValue('console.log("forecast")'),
    });

    const result = await transpiler.getTranspiledPanel(descriptor);
    await transpiler.invalidateSession('session-1');
    const afterInvalidation = await transpiler.getTranspiledPanel(descriptor);

    expect(afterInvalidation.cache_status).toBe('miss');
    expect(afterInvalidation.entry.cache_key).toBe(result.entry.cache_key);
  });
});
