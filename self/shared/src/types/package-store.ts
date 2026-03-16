import { z } from 'zod';
import { CanonicalPackageTypeSchema } from './package-manifest.js';

export const CanonicalRootDirectorySchema = z.enum([
  '.apps',
  '.skills',
  '.workflows',
  '.projects',
  '.contracts',
]);
export type CanonicalRootDirectory = z.infer<typeof CanonicalRootDirectorySchema>;

export const CanonicalRootSurfaceSchema = z.enum([
  'package_store',
  'workspace',
  'shared_contracts',
]);
export type CanonicalRootSurface = z.infer<typeof CanonicalRootSurfaceSchema>;

export const CanonicalStoreDescriptorSchema = z.object({
  rootDir: CanonicalRootDirectorySchema,
  surface: CanonicalRootSurfaceSchema,
  canonicalPackageType: z.lazy(() => CanonicalPackageTypeSchema).optional(),
  supportsSystemPackages: z.boolean(),
  systemDir: z.string().min(1).optional(),
  exists: z.boolean(),
  absolutePath: z.string().min(1),
});
export type CanonicalStoreDescriptor = z.infer<typeof CanonicalStoreDescriptorSchema>;

export const CanonicalStoreDiscoverySnapshotSchema = z.object({
  instanceRoot: z.string().min(1),
  entries: z.array(CanonicalStoreDescriptorSchema).length(5),
  missingRequiredRoots: z.array(CanonicalRootDirectorySchema).default([]),
});
export type CanonicalStoreDiscoverySnapshot = z.infer<
  typeof CanonicalStoreDiscoverySnapshotSchema
>;

export const CANONICAL_PACKAGE_ROOT_BY_TYPE = {
  app: '.apps',
  skill: '.skills',
  workflow: '.workflows',
} as const;

export interface CanonicalStoreLayoutEntry {
  rootDir: CanonicalRootDirectory;
  surface: CanonicalRootSurface;
  canonicalPackageType?: z.infer<typeof CanonicalPackageTypeSchema>;
  supportsSystemPackages: boolean;
}

export const CANONICAL_STORE_LAYOUT = [
  {
    rootDir: '.apps',
    surface: 'package_store',
    canonicalPackageType: 'app',
    supportsSystemPackages: true,
  },
  {
    rootDir: '.skills',
    surface: 'package_store',
    canonicalPackageType: 'skill',
    supportsSystemPackages: true,
  },
  {
    rootDir: '.workflows',
    surface: 'package_store',
    canonicalPackageType: 'workflow',
    supportsSystemPackages: true,
  },
  {
    rootDir: '.projects',
    surface: 'workspace',
    supportsSystemPackages: false,
  },
  {
    rootDir: '.contracts',
    surface: 'shared_contracts',
    supportsSystemPackages: false,
  },
] as const satisfies readonly CanonicalStoreLayoutEntry[];

export const resolveCanonicalRootDirectory = (
  packageType: keyof typeof CANONICAL_PACKAGE_ROOT_BY_TYPE,
): CanonicalRootDirectory => CANONICAL_PACKAGE_ROOT_BY_TYPE[packageType];
