import { basename } from 'node:path';
import type {
  CanonicalInstallTarget,
  IRuntime,
  PackageInstallJournalEntry,
  RegistryRelease,
} from '@nous/shared';
import { PackageInstallJournalEntrySchema } from '@nous/shared';

const buildJournalEntry = (
  packageId: string,
  selectedVersion: string,
  targetPath: string,
  action: PackageInstallJournalEntry['action'],
  status: PackageInstallJournalEntry['status'],
): PackageInstallJournalEntry =>
  PackageInstallJournalEntrySchema.parse({
    package_id: packageId,
    selected_version: selectedVersion,
    target_path: targetPath,
    action,
    status,
    evidence_refs: [],
  });

export class MaterializationError extends Error {
  constructor(
    message: string,
    readonly rollbackNeeded: boolean,
    readonly backupPath?: string,
  ) {
    super(message);
    this.name = 'MaterializationError';
  }
}

export const resolveRollbackPath = (
  runtime: IRuntime,
  target: CanonicalInstallTarget,
): string =>
  runtime.resolvePath(
    target.absolute_root_path,
    `.rollback-${basename(target.package_path)}`,
  );

export interface MaterializePackageResult {
  writes: PackageInstallJournalEntry[];
  backupPath?: string;
}

export const materializePackage = async (options: {
  runtime: IRuntime;
  release: RegistryRelease;
  target: CanonicalInstallTarget;
  createBackup?: boolean;
}): Promise<MaterializePackageResult> => {
  const writes: PackageInstallJournalEntry[] = [];
  const backupPath = options.createBackup
    ? resolveRollbackPath(options.runtime, options.target)
    : undefined;

  if (options.release.install_source_path) {
    if (!(await options.runtime.exists(options.release.install_source_path))) {
      throw new MaterializationError(
        `Install source path does not exist: ${options.release.install_source_path}`,
        false,
        backupPath,
      );
    }
  }

  writes.push(
    buildJournalEntry(
      options.target.package_id,
      options.release.package_version,
      options.target.package_path,
      'prepare',
      'pending',
    ),
  );
  await options.runtime.ensureDir(options.target.absolute_root_path);
  writes.push(
    buildJournalEntry(
      options.target.package_id,
      options.release.package_version,
      options.target.package_path,
      'prepare',
      'applied',
    ),
  );

  if (backupPath && (await options.runtime.exists(options.target.package_path))) {
    await options.runtime.removePath(backupPath);
    await options.runtime.copyDirectory(options.target.package_path, backupPath);
  }

  await options.runtime.removePath(options.target.package_path);
  writes.push(
    buildJournalEntry(
      options.target.package_id,
      options.release.package_version,
      options.target.package_path,
      'write',
      'pending',
    ),
  );

  try {
    if (options.release.install_source_path) {
      await options.runtime.copyDirectory(
        options.release.install_source_path,
        options.target.package_path,
      );
    } else {
      await options.runtime.ensureDir(options.target.package_path);
      await options.runtime.writeFile(
        options.runtime.resolvePath(options.target.package_path, '.nous-package.json'),
        JSON.stringify(
          {
            package_id: options.release.package_id,
            package_type: options.release.package_type,
            package_version: options.release.package_version,
            release_id: options.release.release_id,
            source_hash: options.release.source_hash,
            dependencies: options.release.dependencies,
          },
          null,
          2,
        ),
      );
    }
  } catch (error) {
    throw new MaterializationError(
      error instanceof Error ? error.message : String(error),
      true,
      backupPath,
    );
  }

  writes.push(
    buildJournalEntry(
      options.target.package_id,
      options.release.package_version,
      options.target.package_path,
      'write',
      'applied',
    ),
  );

  return {
    writes,
    backupPath,
  };
};

export const rollbackMaterializedPackage = async (options: {
  runtime: IRuntime;
  target: CanonicalInstallTarget;
  selectedVersion: string;
  backupPath?: string;
}): Promise<PackageInstallJournalEntry[]> => {
  const writes: PackageInstallJournalEntry[] = [
    buildJournalEntry(
      options.target.package_id,
      options.selectedVersion,
      options.target.package_path,
      'rollback',
      'pending',
    ),
  ];

  await options.runtime.removePath(options.target.package_path);
  if (options.backupPath && (await options.runtime.exists(options.backupPath))) {
    await options.runtime.copyDirectory(options.backupPath, options.target.package_path);
    await options.runtime.removePath(options.backupPath);
  }

  writes.push(
    buildJournalEntry(
      options.target.package_id,
      options.selectedVersion,
      options.target.package_path,
      'rollback',
      'rolled_back',
    ),
  );

  return writes;
};
