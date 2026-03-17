import { describe, expect, it } from 'vitest';
import { buildAppLaunchSpec, compileAppPermissions, normalizeAppHosts } from '../permission-compiler.js';

const manifest = {
  permissions: {
    network: ['API.EXAMPLE.COM', 'api.example.com', 'weather.example.com'],
  },
} as const;

describe('normalizeAppHosts', () => {
  it('lowercases, deduplicates, and sorts hosts deterministically', () => {
    expect(normalizeAppHosts(manifest.permissions.network)).toEqual([
      'api.example.com',
      'weather.example.com',
    ]);
  });
});

describe('compileAppPermissions', () => {
  it('adds canonical app data access and hard-deny flags', () => {
    const compiled = compileAppPermissions({
      manifest,
      appDataDir: '/runtime/apps/weather',
      readPaths: ['/repo/apps/weather'],
      writePaths: ['/repo/apps/weather/cache'],
    });

    expect(compiled.allow_read).toEqual(['/repo/apps/weather', '/runtime/apps/weather']);
    expect(compiled.allow_write).toEqual([
      '/repo/apps/weather/cache',
      '/runtime/apps/weather',
    ]);
    expect(compiled.allow_net).toEqual(['api.example.com', 'weather.example.com']);
    expect(compiled.deny_env).toBe(true);
    expect(compiled.deny_run).toBe(true);
    expect(compiled.deny_ffi).toBe(true);
  });
});

describe('buildAppLaunchSpec', () => {
  it('emits stable Deno flags for equivalent input', () => {
    const first = buildAppLaunchSpec({
      appId: 'app:weather',
      packageId: 'app:weather',
      packageVersion: '1.0.0',
      manifest,
      entrypoint: 'main.ts',
      workingDirectory: '/repo/apps/weather',
      appDataDir: '/runtime/apps/weather',
      configVersion: 'cfg-1',
      readPaths: ['/repo/apps/weather'],
      writePaths: ['/repo/apps/weather/cache'],
      lockfilePath: '/repo/apps/weather/deno.lock',
    });
    const second = buildAppLaunchSpec({
      appId: 'app:weather',
      packageId: 'app:weather',
      packageVersion: '1.0.0',
      manifest: {
        permissions: {
          network: ['weather.example.com', 'api.example.com', 'API.EXAMPLE.COM'],
        },
      },
      entrypoint: 'main.ts',
      workingDirectory: '/repo/apps/weather',
      appDataDir: '/runtime/apps/weather',
      configVersion: 'cfg-1',
      readPaths: ['/repo/apps/weather'],
      writePaths: ['/repo/apps/weather/cache'],
      lockfilePath: '/repo/apps/weather/deno.lock',
    });

    expect(first.compiled_permissions).toEqual(second.compiled_permissions);
    expect(first.deno_args).toEqual(second.deno_args);
    expect(first.deno_args).toContain('--deny-env');
    expect(first.deno_args).toContain('--deny-run');
    expect(first.deno_args).toContain('--deny-ffi');
  });
});
