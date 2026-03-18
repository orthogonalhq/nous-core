import { describe, expect, it } from 'vitest';
import {
  CANONICAL_STORE_LAYOUT,
  CanonicalStoreDescriptorSchema,
  CanonicalStoreDiscoverySnapshotSchema,
  resolveCanonicalRootDirectory,
} from '../../types/package-store.js';

describe('CANONICAL_STORE_LAYOUT', () => {
  it('defines the five canonical root entries in order', () => {
    expect(CANONICAL_STORE_LAYOUT.map((entry) => entry.rootDir)).toEqual([
      '.apps',
      '.skills',
      '.workflows',
      '.projects',
      '.contracts',
    ]);
  });

  it('maps canonical package types to canonical store roots', () => {
    expect(resolveCanonicalRootDirectory('app')).toBe('.apps');
    expect(resolveCanonicalRootDirectory('skill')).toBe('.skills');
    expect(resolveCanonicalRootDirectory('workflow')).toBe('.workflows');
  });
});

describe('CanonicalStoreDescriptorSchema', () => {
  it('accepts package-store roots with system support', () => {
    const result = CanonicalStoreDescriptorSchema.safeParse({
      rootDir: '.skills',
      surface: 'package_store',
      canonicalPackageType: 'skill',
      supportsSystemPackages: true,
      systemDir: 'C:/nous/.skills/.system',
      exists: true,
      absolutePath: 'C:/nous/.skills',
    });

    expect(result.success).toBe(true);
  });

  it('accepts workspace roots without canonical package types', () => {
    const result = CanonicalStoreDescriptorSchema.safeParse({
      rootDir: '.projects',
      surface: 'workspace',
      supportsSystemPackages: false,
      exists: true,
      absolutePath: 'C:/nous/.projects',
    });

    expect(result.success).toBe(true);
  });
});

describe('CanonicalStoreDiscoverySnapshotSchema', () => {
  it('requires all five canonical root entries', () => {
    const result = CanonicalStoreDiscoverySnapshotSchema.safeParse({
      instanceRoot: 'C:/nous',
      entries: [
        {
          rootDir: '.apps',
          surface: 'package_store',
          canonicalPackageType: 'app',
          supportsSystemPackages: true,
          absolutePath: 'C:/nous/.apps',
          exists: true,
        },
      ],
      missingRequiredRoots: [],
    });

    expect(result.success).toBe(false);
  });
});
