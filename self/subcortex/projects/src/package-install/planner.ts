import {
  CanonicalInstallTargetSchema,
  PackageResolutionFailureSchema,
  PackageResolutionResultSchema,
  type CanonicalInstallTarget,
  type IRuntime,
  type PackageInstallRequest,
  type PackageResolutionFailure,
  type PackageResolutionResult,
} from '@nous/shared';
import { discoverCanonicalPackageStores } from '../package-store/discovery.js';

export type BuildInstallTargetsOutcome =
  | { ok: true; targets: Map<string, CanonicalInstallTarget> }
  | { ok: false; failure: PackageResolutionFailure };

const SYSTEM_BOUNDARY_PATTERN = /(^|[\\/])\.system([\\/]|$)/;

const sanitizePackageId = (packageId: string): string =>
  packageId.replace(/[^a-zA-Z0-9._-]+/g, '__');

export const buildInstallTargets = async (options: {
  request: PackageInstallRequest;
  resolution: PackageResolutionResult;
  runtime: IRuntime;
}): Promise<BuildInstallTargetsOutcome> => {
  const resolution = PackageResolutionResultSchema.parse(options.resolution);
  const snapshot = await discoverCanonicalPackageStores({
    instanceRoot: options.request.instance_root ?? process.cwd(),
    runtime: options.runtime,
  });

  const targets = new Map<string, CanonicalInstallTarget>();

  for (const node of resolution.nodes) {
    const root = snapshot.entries.find((entry) => entry.rootDir === node.install_root);
    if (!root || root.surface !== 'package_store') {
      return {
        ok: false,
        failure: PackageResolutionFailureSchema.parse({
          reason_code: 'PKG-009-STORE_TARGET_INVALID',
          package_id: node.package_id,
          detail: `Invalid canonical install root: ${node.install_root}`,
        }),
      };
    }

    const packagePath = options.runtime.resolvePath(
      root.absolutePath,
      sanitizePackageId(node.package_id),
    );
    if (SYSTEM_BOUNDARY_PATTERN.test(packagePath)) {
      return {
        ok: false,
        failure: PackageResolutionFailureSchema.parse({
          reason_code: 'PKG-009-SYSTEM_BOUNDARY_VIOLATION',
          package_id: node.package_id,
          detail: packagePath,
        }),
      };
    }

    targets.set(
      node.package_id,
      CanonicalInstallTargetSchema.parse({
        package_id: node.package_id,
        package_type: node.package_type,
        root_dir: node.install_root,
        absolute_root_path: root.absolutePath,
        package_path: packagePath,
        system_boundary: 'user_store',
      }),
    );
  }

  return { ok: true, targets };
};
