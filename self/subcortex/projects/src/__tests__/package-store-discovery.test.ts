import { describe, expect, it } from 'vitest';
import type { IRuntime, PlatformInfo } from '@nous/shared';
import { discoverCanonicalPackageStores } from '../package-store/discovery.js';

class FakeRuntime implements IRuntime {
  constructor(private readonly existingPaths: ReadonlySet<string>) {}

  resolvePath(...segments: string[]): string {
    return segments.join('/').replace(/\/+/g, '/');
  }

  getDataDir(): string {
    return '/data';
  }

  async exists(path: string): Promise<boolean> {
    return this.existingPaths.has(path);
  }

  getPlatform(): PlatformInfo {
    return {
      os: 'linux',
      arch: 'x64',
      nodeVersion: process.version,
    };
  }
}

describe('discoverCanonicalPackageStores', () => {
  it('builds a deterministic five-root snapshot and preserves .skills system support', async () => {
    const runtime = new FakeRuntime(
      new Set([
        '/workspace/.apps',
        '/workspace/.skills',
        '/workspace/.workflows',
        '/workspace/.projects',
        '/workspace/.contracts',
      ]),
    );

    const result = await discoverCanonicalPackageStores({
      instanceRoot: '/workspace',
      runtime,
    });

    expect(result.entries).toHaveLength(5);
    expect(result.missingRequiredRoots).toEqual([]);
    expect(result.entries.find((entry) => entry.rootDir === '.skills')?.systemDir).toBe(
      '/workspace/.skills/.system',
    );
    expect(
      result.entries.find((entry) => entry.rootDir === '.projects')?.surface,
    ).toBe('workspace');
  });

  it('marks missing package-store roots explicitly and never classifies .projects or .contracts as package stores', async () => {
    const runtime = new FakeRuntime(new Set(['/workspace/.skills']));

    const result = await discoverCanonicalPackageStores({
      instanceRoot: '/workspace',
      runtime,
    });

    expect(result.missingRequiredRoots).toEqual([
      '.apps',
      '.workflows',
      '.projects',
      '.contracts',
    ]);
    expect(
      result.entries.find((entry) => entry.rootDir === '.projects')?.surface,
    ).toBe('workspace');
    expect(
      result.entries.find((entry) => entry.rootDir === '.contracts')?.surface,
    ).toBe('shared_contracts');
  });
});
