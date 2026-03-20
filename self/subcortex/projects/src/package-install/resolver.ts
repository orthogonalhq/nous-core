import semver from 'semver';
import type {
  IRegistryService,
  PackageDependencySpec,
  PackageInstallRequest,
  PackageResolutionFailure,
  PackageResolutionResult,
  RegistryPackage,
  RegistryRelease,
  ResolvedPackageNode,
} from '@nous/shared';
import {
  PackageResolutionFailureSchema,
  PackageResolutionResultSchema,
  resolveCanonicalRootDirectory,
} from '@nous/shared';

interface PackageConstraint {
  packageType?: RegistryPackage['package_type'];
  requestedRanges: Set<string>;
  parentIds: Set<string>;
  pinnedReleaseId?: string;
}

interface SelectedReleaseState {
  packageRecord: RegistryPackage;
  releaseRecord: RegistryRelease;
}

interface ResolverState {
  constraints: Map<string, PackageConstraint>;
  selected: Map<string, SelectedReleaseState>;
  edges: Map<string, Set<string>>;
}

type ResolveResult =
  | { ok: true; state: ResolverState }
  | { ok: false; failure: PackageResolutionFailure };

const createConstraint = (
  dependency?: Pick<PackageDependencySpec, 'package_type' | 'version_range'>,
  options?: { parentId?: string; pinnedReleaseId?: string },
): PackageConstraint => ({
  packageType: dependency?.package_type,
  requestedRanges: new Set(
    dependency?.version_range ? [dependency.version_range] : [],
  ),
  parentIds: new Set(options?.parentId ? [options.parentId] : []),
  pinnedReleaseId: options?.pinnedReleaseId,
});

const cloneState = (state: ResolverState): ResolverState => ({
  constraints: new Map(
    [...state.constraints.entries()].map(([packageId, constraint]) => [
      packageId,
      {
        packageType: constraint.packageType,
        requestedRanges: new Set(constraint.requestedRanges),
        parentIds: new Set(constraint.parentIds),
        pinnedReleaseId: constraint.pinnedReleaseId,
      },
    ]),
  ),
  selected: new Map(state.selected),
  edges: new Map(
    [...state.edges.entries()].map(([packageId, dependencies]) => [
      packageId,
      new Set(dependencies),
    ]),
  ),
});

const buildFailure = (
  reason_code: PackageResolutionFailure['reason_code'],
  extra: Omit<PackageResolutionFailure, 'reason_code'> = {},
): PackageResolutionFailure =>
  PackageResolutionFailureSchema.parse({
    reason_code,
    ...extra,
  });

const sortReleases = (releases: readonly RegistryRelease[]): RegistryRelease[] =>
  [...releases].sort((left, right) => {
    const versionOrder = semver.rcompare(
      left.package_version,
      right.package_version,
    );
    if (versionOrder !== 0) {
      return versionOrder;
    }
    const publishOrder = right.published_at.localeCompare(left.published_at);
    if (publishOrder !== 0) {
      return publishOrder;
    }
    return left.release_id.localeCompare(right.release_id);
  });

const requestedRangesForNode = (
  constraint: PackageConstraint | undefined,
  fallbackVersion: string,
): string[] => {
  const requestedRanges = [...(constraint?.requestedRanges ?? new Set<string>())];
  return requestedRanges.length > 0 ? requestedRanges : [fallbackVersion];
};

const collectReachable = (
  rootPackageId: string,
  edges: ReadonlyMap<string, ReadonlySet<string>>,
): Set<string> => {
  const visited = new Set<string>();
  const walk = (packageId: string) => {
    if (visited.has(packageId)) {
      return;
    }
    visited.add(packageId);
    for (const dependencyId of edges.get(packageId) ?? []) {
      walk(dependencyId);
    }
  };
  walk(rootPackageId);
  return visited;
};

const topologicalOrder = (
  rootPackageId: string,
  edges: ReadonlyMap<string, ReadonlySet<string>>,
): string[] => {
  const visited = new Set<string>();
  const ordered: string[] = [];

  const visit = (packageId: string) => {
    if (visited.has(packageId)) {
      return;
    }
    visited.add(packageId);
    for (const dependencyId of edges.get(packageId) ?? []) {
      visit(dependencyId);
    }
    ordered.push(packageId);
  };

  visit(rootPackageId);
  return ordered;
};

const mergeDependencyConstraint = (
  state: ResolverState,
  dependency: PackageDependencySpec,
  parentId: string,
): ResolverState => {
  const nextState = cloneState(state);
  const existing =
    nextState.constraints.get(dependency.package_id) ?? createConstraint();

  existing.packageType = existing.packageType ?? dependency.package_type;
  existing.requestedRanges.add(dependency.version_range);
  existing.parentIds.add(parentId);

  nextState.constraints.set(dependency.package_id, existing);
  return nextState;
};

const selectCandidates = (
  releases: readonly RegistryRelease[],
  constraint: PackageConstraint,
): RegistryRelease[] => {
  const requestedRanges = [...constraint.requestedRanges];

  return sortReleases(releases).filter((release) => {
    if (
      constraint.packageType &&
      release.package_type !== constraint.packageType
    ) {
      return false;
    }
    if (
      constraint.pinnedReleaseId &&
      release.release_id !== constraint.pinnedReleaseId
    ) {
      return false;
    }
    return requestedRanges.every((range) => {
      const validRange = semver.validRange(range);
      return validRange != null
        ? semver.satisfies(release.package_version, validRange, {
            includePrerelease: true,
          })
        : false;
    });
  });
};

const buildCandidateFailure = (
  constraint: PackageConstraint,
  packageId: string,
  releases: readonly RegistryRelease[],
): PackageResolutionFailure => {
  const requestedRanges = [...constraint.requestedRanges];
  const invalidRange = requestedRanges.find((range) => semver.validRange(range) == null);
  if (invalidRange) {
    return buildFailure('PKG-009-DEPENDENCY_UNRESOLVED', {
      package_id: packageId,
      version_range: invalidRange,
      detail: `Invalid semver range: ${invalidRange}`,
    });
  }

  if (releases.length > 0 && requestedRanges.length > 0) {
    return buildFailure('PKG-009-DEPENDENCY_RANGE_CONFLICT', {
      package_id: packageId,
      version_range: requestedRanges.join(', '),
      conflict_package_id: packageId,
      detail: 'No registry release satisfies all requested ranges.',
    });
  }

  return buildFailure('PKG-009-DEPENDENCY_UNRESOLVED', {
    package_id: packageId,
    detail: 'No registry release is available for this package.',
  });
};

const buildResolutionResult = (
  rootPackageId: string,
  state: ResolverState,
): PackageResolutionResult => {
  const reachable = collectReachable(rootPackageId, state.edges);
  const nodes: ResolvedPackageNode[] = [...reachable]
    .map((packageId) => {
      const selected = state.selected.get(packageId);
      if (!selected) {
        throw new Error(`Missing selected release for ${packageId}`);
      }
      const constraint = state.constraints.get(packageId);
      return {
        package_id: packageId,
        package_type: selected.releaseRecord.package_type,
        selected_version: selected.releaseRecord.package_version,
        requested_ranges: requestedRangesForNode(
          constraint,
          selected.releaseRecord.package_version,
        ),
        dependency_ids: [...(state.edges.get(packageId) ?? [])],
        install_root: resolveCanonicalRootDirectory(
          selected.releaseRecord.package_type,
        ),
        source_release_id: selected.releaseRecord.release_id,
        dedupe_parent_ids: [...(constraint?.parentIds ?? new Set<string>())],
      };
    })
    .sort((left, right) => left.package_id.localeCompare(right.package_id));

  return PackageResolutionResultSchema.parse({
    root_package_id: rootPackageId,
    nodes,
    install_order: topologicalOrder(rootPackageId, state.edges),
    deduped_package_ids: nodes
      .filter((node) => node.dedupe_parent_ids.length > 1)
      .map((node) => node.package_id),
    blocked: false,
  });
};

async function resolvePackageRecursively(
  packageId: string,
  state: ResolverState,
  registryService: IRegistryService,
  path: readonly string[],
): Promise<ResolveResult> {
  if (path.includes(packageId)) {
    return {
      ok: false,
      failure: buildFailure('PKG-009-DEPENDENCY_CYCLE', {
        package_id: packageId,
        detail: [...path, packageId].join(' -> '),
      }),
    };
  }

  const constraint = state.constraints.get(packageId);
  if (!constraint) {
    return {
      ok: false,
      failure: buildFailure('PKG-009-DEPENDENCY_UNRESOLVED', {
        package_id: packageId,
        detail: 'Missing dependency constraint.',
      }),
    };
  }

  const packageRecord = await registryService.getPackage(packageId);
  if (!packageRecord) {
    return {
      ok: false,
      failure: buildFailure('PKG-009-DEPENDENCY_UNRESOLVED', {
        package_id: packageId,
        detail: 'Registry package was not found.',
      }),
    };
  }

  const releases = await registryService.listReleases(packageId);
  const candidates = selectCandidates(releases, constraint);
  if (candidates.length === 0) {
    return {
      ok: false,
      failure: buildCandidateFailure(constraint, packageId, releases),
    };
  }

  let lastFailure: PackageResolutionFailure | null = null;

  for (const candidate of candidates) {
    let candidateState = cloneState(state);
    candidateState.selected.set(packageId, {
      packageRecord,
      releaseRecord: candidate,
    });

    const dependencyIds = new Set<string>();
    let candidateFailed = false;

    for (const dependency of candidate.dependencies.packages.filter(
      (item) => item.required !== false,
    )) {
      dependencyIds.add(dependency.package_id);
      if (path.includes(dependency.package_id)) {
        lastFailure = buildFailure('PKG-009-DEPENDENCY_CYCLE', {
          package_id: dependency.package_id,
          detail: [...path, packageId, dependency.package_id].join(' -> '),
        });
        candidateFailed = true;
        break;
      }

      candidateState = mergeDependencyConstraint(
        candidateState,
        dependency,
        packageId,
      );
      const resolvedDependency = await resolvePackageRecursively(
        dependency.package_id,
        candidateState,
        registryService,
        [...path, packageId],
      );

      if (!resolvedDependency.ok) {
        lastFailure = resolvedDependency.failure;
        candidateFailed = true;
        break;
      }

      candidateState = resolvedDependency.state;
    }

    if (candidateFailed) {
      continue;
    }

    candidateState.edges.set(packageId, dependencyIds);
    return {
      ok: true,
      state: candidateState,
    };
  }

  return {
    ok: false,
    failure:
      lastFailure ??
      buildFailure('PKG-009-DEPENDENCY_UNRESOLVED', {
        package_id: packageId,
      }),
  };
}

export interface ResolveDependencyGraphOptions {
  registryService: IRegistryService;
  request: PackageInstallRequest;
}

export const resolveDependencyGraph = async (
  options: ResolveDependencyGraphOptions,
): Promise<PackageResolutionResult> => {
  const rootConstraint = createConstraint(undefined, {
    pinnedReleaseId: options.request.release_id,
  });
  rootConstraint.requestedRanges = new Set([
    options.request.requested_version_range ?? '*',
  ]);

  const initialState: ResolverState = {
    constraints: new Map([[options.request.package_id, rootConstraint]]),
    selected: new Map(),
    edges: new Map(),
  };

  const resolved = await resolvePackageRecursively(
    options.request.package_id,
    initialState,
    options.registryService,
    [],
  );

  if (!resolved.ok) {
    return PackageResolutionResultSchema.parse({
      root_package_id: options.request.package_id,
      nodes: [],
      install_order: [],
      deduped_package_ids: [],
      blocked: true,
      failure: resolved.failure,
    });
  }

  return buildResolutionResult(options.request.package_id, resolved.state);
};
