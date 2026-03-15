import {
  CANONICAL_STORE_LAYOUT,
  CanonicalStoreDescriptorSchema,
  CanonicalStoreDiscoverySnapshotSchema,
  type CanonicalStoreDiscoverySnapshot,
  type IRuntime,
} from '@nous/shared';

export interface PackageStoreDiscoveryOptions {
  instanceRoot: string;
  runtime: IRuntime;
}

export const discoverCanonicalPackageStores = async (
  options: PackageStoreDiscoveryOptions,
): Promise<CanonicalStoreDiscoverySnapshot> => {
  const entries = await Promise.all(
    CANONICAL_STORE_LAYOUT.map(async (layout) => {
      const absolutePath = options.runtime.resolvePath(
        options.instanceRoot,
        layout.rootDir,
      );
      const exists = await options.runtime.exists(absolutePath);
      const systemDir = layout.supportsSystemPackages
        ? options.runtime.resolvePath(absolutePath, '.system')
        : undefined;

      return CanonicalStoreDescriptorSchema.parse({
        ...layout,
        absolutePath,
        exists,
        ...(systemDir ? { systemDir } : {}),
      });
    }),
  );

  return CanonicalStoreDiscoverySnapshotSchema.parse({
    instanceRoot: options.instanceRoot,
    entries,
    missingRequiredRoots: entries
      .filter((entry) => !entry.exists)
      .map((entry) => entry.rootDir),
  });
};
