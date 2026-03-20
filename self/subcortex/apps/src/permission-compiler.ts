import {
  AppLaunchSpecSchema,
  type AppCompiledPermissionFlags,
  type AppLaunchSpec,
  type AppPackageManifest,
} from '@nous/shared';

export interface CompileAppPermissionsInput {
  manifest: Pick<AppPackageManifest, 'permissions'>;
  appDataDir: string;
  readPaths?: readonly string[];
  writePaths?: readonly string[];
}

const sortUnique = (values: readonly string[]): string[] =>
  [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );

export const normalizeAppHosts = (hosts: readonly string[]): string[] =>
  sortUnique(hosts.map((host) => host.toLowerCase()));

export const compileAppPermissions = (
  input: CompileAppPermissionsInput,
): AppCompiledPermissionFlags => ({
  allow_read: sortUnique([...(input.readPaths ?? []), input.appDataDir]),
  allow_write: sortUnique([...(input.writePaths ?? []), input.appDataDir]),
  allow_net: normalizeAppHosts(input.manifest.permissions.network),
  deny_env: true,
  deny_run: true,
  deny_ffi: true,
  cached_only: true,
});

export interface BuildAppLaunchSpecInput {
  appId: string;
  packageId: string;
  packageVersion: string;
  manifest: Pick<AppPackageManifest, 'permissions'>;
  entrypoint: string;
  workingDirectory: string;
  appDataDir: string;
  configVersion: string;
  readPaths?: readonly string[];
  writePaths?: readonly string[];
  lockfilePath?: string;
  manifestRef?: string;
}

export const buildAppLaunchSpec = (
  input: BuildAppLaunchSpecInput,
): AppLaunchSpec =>
  AppLaunchSpecSchema.parse({
    app_id: input.appId,
    package_id: input.packageId,
    package_version: input.packageVersion,
    entrypoint: input.entrypoint,
    working_directory: input.workingDirectory,
    deno_args: [
      'run',
      '--deny-env',
      '--deny-run',
      '--deny-ffi',
      '--cached-only',
      `--allow-read=${compileAppPermissions(input).allow_read.join(',')}`,
      `--allow-write=${compileAppPermissions(input).allow_write.join(',')}`,
      ...(compileAppPermissions(input).allow_net.length > 0
        ? [`--allow-net=${compileAppPermissions(input).allow_net.join(',')}`]
        : []),
      ...(input.lockfilePath ? ['--lock', input.lockfilePath] : []),
      input.entrypoint,
    ],
    compiled_permissions: compileAppPermissions(input),
    lockfile_path: input.lockfilePath,
    app_data_dir: input.appDataDir,
    config_version: input.configVersion,
    manifest_ref: input.manifestRef,
  });
