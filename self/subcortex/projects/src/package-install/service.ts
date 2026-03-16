import type {
  CanonicalInstallTarget,
  IPackageInstallService,
  IPackageLifecycleOrchestrator,
  IRegistryService,
  IRuntime,
  PackageInstallRequest,
  PackageInstallResult,
  PackageLifecycleStateRecord,
  PackageLifecycleTransitionRequest,
  PackageLifecycleTransitionResult,
  RegistryInstallEligibilitySnapshot,
  RegistryRelease,
} from '@nous/shared';
import {
  PackageInstallRequestSchema,
  PackageInstallResultSchema,
  PackageResolutionFailureSchema,
  PackageResolutionResultSchema,
} from '@nous/shared';
import { evaluateTransitionGuards } from '../package-lifecycle/transition-validator.js';
import { buildInstallTargets } from './planner.js';
import {
  MaterializationError,
  materializePackage,
  resolveRollbackPath,
  rollbackMaterializedPackage,
} from './materializer.js';
import { resolveDependencyGraph } from './resolver.js';

export interface PackageInstallServiceOptions {
  registryService: IRegistryService;
  lifecycleOrchestrator: IPackageLifecycleOrchestrator;
  runtime: IRuntime;
  instanceRoot?: string;
  now?: () => string;
}

const defaultNow = (): string => new Date().toISOString();

const appendResult = (
  collection: PackageLifecycleTransitionResult[],
  result: PackageLifecycleTransitionResult,
): PackageLifecycleTransitionResult[] => {
  collection.push(result);
  return collection;
};

const collectAppliedWrites = (
  writes: PackageInstallResult['writes'],
): PackageInstallResult['writes'] => {
  const stillApplied = new Set<string>();
  const appliedWrites: PackageInstallResult['writes'] = [];

  for (const entry of writes) {
    if (entry.action === 'write' && entry.status === 'applied') {
      stillApplied.add(entry.package_id);
      appliedWrites.push(entry);
      continue;
    }

    if (entry.action === 'rollback' && entry.status === 'rolled_back') {
      stillApplied.delete(entry.package_id);
    }
  }

  const ordered: PackageInstallResult['writes'] = [];
  const seen = new Set<string>();
  for (let index = appliedWrites.length - 1; index >= 0; index -= 1) {
    const entry = appliedWrites[index]!;
    if (!stillApplied.has(entry.package_id) || seen.has(entry.package_id)) {
      continue;
    }
    seen.add(entry.package_id);
    ordered.push(entry);
  }

  return ordered;
};

const buildLifecycleRequest = (input: {
  installRequest: PackageInstallRequest;
  release: RegistryRelease;
  transition: PackageLifecycleTransitionRequest['target_transition'];
  currentState?: PackageLifecycleStateRecord | null;
  targetVersion?: string;
  registryEligibility?: RegistryInstallEligibilitySnapshot;
}): PackageLifecycleTransitionRequest => ({
  project_id: input.installRequest.project_id,
  package_id: input.release.package_id,
  package_version:
    input.currentState?.package_version ?? input.release.package_version,
  origin_class: input.release.origin_class,
  target_transition: input.transition,
  actor_id: input.installRequest.actor_id,
  target_version: input.targetVersion,
  checkpoint_ref:
    input.transition === 'stage_update'
      ? `checkpoint:${input.release.package_id}:${input.targetVersion ?? input.release.package_version}`
      : undefined,
  admission:
    input.transition === 'install'
      ? {
          signature_valid: input.registryEligibility?.metadata_valid ?? true,
          signer_known: input.registryEligibility?.signer_valid ?? true,
          policy_compatible: true,
          is_draft_unsigned: false,
          is_imported: false,
          reverification_complete: true,
          reapproval_complete: true,
        }
      : undefined,
  compatibility:
    input.transition === 'install'
      ? {
          api_compatible:
            input.registryEligibility?.compatibility_state !== 'blocked_incompatible',
        }
      : undefined,
  registry_eligibility:
    input.transition === 'install' ? input.registryEligibility : undefined,
  update_checks:
    input.transition === 'commit_update'
      ? {
          migration_passed: true,
          health_passed: true,
          invariants_passed: true,
        }
      : undefined,
  rollback:
    input.transition === 'rollback_update'
      ? {
          trust_checks_passed: true,
        }
      : undefined,
});

export class PackageInstallService implements IPackageInstallService {
  private readonly now: () => string;

  constructor(private readonly options: PackageInstallServiceOptions) {
    this.now = options.now ?? defaultNow;
  }

  async installPackage(request: PackageInstallRequest): Promise<PackageInstallResult> {
    const parsed = PackageInstallRequestSchema.parse({
      ...request,
      instance_root: request.instance_root ?? this.options.instanceRoot ?? process.cwd(),
    });
    const lifecycleResults: PackageLifecycleTransitionResult[] = [];
    const writes: PackageInstallResult['writes'] = [];

    const resolution = await resolveDependencyGraph({
      registryService: this.options.registryService,
      request: parsed,
    });
    if (resolution.blocked) {
      return PackageInstallResultSchema.parse({
        resolution,
        writes,
        lifecycle_results: lifecycleResults,
        status: 'blocked',
        failure: resolution.failure,
      });
    }

    const targets = await buildInstallTargets({
      request: parsed,
      resolution,
      runtime: this.options.runtime,
    });
    if (!targets.ok) {
      return PackageInstallResultSchema.parse({
        resolution,
        writes,
        lifecycle_results: lifecycleResults,
        status: 'blocked',
        failure: targets.failure,
      });
    }

    const releaseIdsByPackage = new Map(
      resolution.nodes
        .filter((node) => node.source_release_id)
        .map((node) => [node.package_id, node.source_release_id!] as const),
    );

    for (const packageId of resolution.install_order) {
      const releaseId = releaseIdsByPackage.get(packageId);
      if (!releaseId) {
        return PackageInstallResultSchema.parse({
          resolution,
          writes,
          lifecycle_results: lifecycleResults,
          status: 'blocked',
          failure: PackageResolutionFailureSchema.parse({
            reason_code: 'PKG-009-DEPENDENCY_UNRESOLVED',
            package_id: packageId,
            detail: 'Resolved package is missing a source release id.',
          }),
        });
      }

      const release = await this.options.registryService.getRelease(releaseId);
      if (!release) {
        return PackageInstallResultSchema.parse({
          resolution,
          writes,
          lifecycle_results: lifecycleResults,
          status: 'blocked',
          failure: PackageResolutionFailureSchema.parse({
            reason_code: 'PKG-009-DEPENDENCY_UNRESOLVED',
            package_id: packageId,
            detail: `Registry release not found: ${releaseId}`,
          }),
        });
      }

      const target = targets.targets.get(packageId);
      if (!target) {
        return PackageInstallResultSchema.parse({
          resolution,
          writes,
          lifecycle_results: lifecycleResults,
          status: 'blocked',
          failure: PackageResolutionFailureSchema.parse({
            reason_code: 'PKG-009-STORE_TARGET_INVALID',
            package_id: packageId,
            detail: 'Missing install target.',
          }),
        });
      }

      const currentState = await this.options.lifecycleOrchestrator.getState(
        parsed.project_id,
        packageId,
      );
      const registryEligibility =
        await this.options.registryService.evaluateInstallEligibility({
          project_id: parsed.project_id,
          package_id: release.package_id,
          release_id: release.release_id,
          principal_override_requested: false,
          principal_override_approved: false,
          evaluated_at: this.now(),
        });

      const nodeResult = await this.installResolvedNode({
        installRequest: parsed,
        release,
        target,
        currentState,
        registryEligibility,
      });

      writes.push(...nodeResult.writes);
      lifecycleResults.push(...nodeResult.lifecycleResults);

      if (!nodeResult.ok) {
        const rollbackWrites = await this.rollbackPreviouslyAppliedNodes({
          writes,
          targets: targets.targets,
        });
        writes.push(...rollbackWrites);

        return PackageInstallResultSchema.parse({
          resolution,
          writes,
          lifecycle_results: lifecycleResults,
          status:
            nodeResult.status === 'rolled_back' || rollbackWrites.length > 0
              ? 'rolled_back'
              : nodeResult.status,
          failure: nodeResult.failure,
        });
      }
    }

    return PackageInstallResultSchema.parse({
      resolution: PackageResolutionResultSchema.parse(resolution),
      writes,
      lifecycle_results: lifecycleResults,
      status: 'installed',
    });
  }

  private async installResolvedNode(input: {
    installRequest: PackageInstallRequest;
    release: RegistryRelease;
    target: CanonicalInstallTarget;
    currentState: PackageLifecycleStateRecord | null;
    registryEligibility: RegistryInstallEligibilitySnapshot;
  }): Promise<
    | {
        ok: true;
        writes: PackageInstallResult['writes'];
        lifecycleResults: PackageLifecycleTransitionResult[];
      }
    | {
        ok: false;
        status: 'blocked' | 'rolled_back';
        writes: PackageInstallResult['writes'];
        lifecycleResults: PackageLifecycleTransitionResult[];
        failure: PackageInstallResult['failure'];
      }
  > {
    const writes: PackageInstallResult['writes'] = [];
    const lifecycleResults: PackageLifecycleTransitionResult[] = [];
    const isUpdate =
      input.currentState != null &&
      input.currentState.package_version !== input.release.package_version &&
      input.currentState.current_state !== 'removed';

    if (!isUpdate) {
      if (!input.currentState) {
        const ingest = await this.options.lifecycleOrchestrator.ingest(
          buildLifecycleRequest({
            installRequest: input.installRequest,
            release: input.release,
            transition: 'ingest',
          }),
        );
        appendResult(lifecycleResults, ingest);
        if (ingest.decision !== 'allowed') {
          return {
            ok: false,
            status: 'blocked',
            writes,
            lifecycleResults,
            failure: PackageResolutionFailureSchema.parse({
              reason_code: ingest.reason_code ?? 'PKG-005-INVALID_TRANSITION',
              package_id: input.release.package_id,
              detail: 'Lifecycle ingest was blocked.',
            }),
          };
        }
      }

      const installRequest = buildLifecycleRequest({
        installRequest: input.installRequest,
        release: input.release,
        transition: 'install',
        registryEligibility: input.registryEligibility,
      });
      const guardFailure = evaluateTransitionGuards(installRequest);
      if (guardFailure) {
        return {
          ok: false,
          status: 'blocked',
          writes,
          lifecycleResults,
          failure: PackageResolutionFailureSchema.parse({
            reason_code: guardFailure,
            package_id: input.release.package_id,
            detail: 'Lifecycle install guards blocked materialization.',
          }),
        };
      }

      try {
        const materialized = await materializePackage({
          runtime: this.options.runtime,
          release: input.release,
          target: input.target,
        });
        writes.push(...materialized.writes);
      } catch (error) {
        writes.push(
          ...(await rollbackMaterializedPackage({
            runtime: this.options.runtime,
            target: input.target,
            selectedVersion: input.release.package_version,
          })),
        );
        return {
          ok: false,
          status: 'rolled_back',
          writes,
          lifecycleResults,
          failure: PackageResolutionFailureSchema.parse({
            reason_code: 'PKG-009-INSTALL_WRITE_FAILED',
            package_id: input.release.package_id,
            detail: error instanceof Error ? error.message : String(error),
          }),
        };
      }

      const install = await this.options.lifecycleOrchestrator.install(installRequest);
      appendResult(lifecycleResults, install);
      if (install.decision !== 'allowed') {
        writes.push(
          ...(await rollbackMaterializedPackage({
            runtime: this.options.runtime,
            target: input.target,
            selectedVersion: input.release.package_version,
          })),
        );
        return {
          ok: false,
          status: 'blocked',
          writes,
          lifecycleResults,
          failure: PackageResolutionFailureSchema.parse({
            reason_code: install.reason_code ?? 'PKG-005-INVALID_TRANSITION',
            package_id: input.release.package_id,
            detail: 'Lifecycle install was blocked after materialization.',
          }),
        };
      }

      return {
        ok: true,
        writes,
        lifecycleResults,
      };
    }

    const stageUpdate = await this.options.lifecycleOrchestrator.stageUpdate(
      buildLifecycleRequest({
        installRequest: input.installRequest,
        release: input.release,
        transition: 'stage_update',
        currentState: input.currentState,
        targetVersion: input.release.package_version,
      }),
    );
    appendResult(lifecycleResults, stageUpdate);
    if (stageUpdate.decision !== 'allowed') {
      return {
        ok: false,
        status: 'blocked',
        writes,
        lifecycleResults,
        failure: PackageResolutionFailureSchema.parse({
          reason_code: stageUpdate.reason_code ?? 'PKG-005-INVALID_TRANSITION',
          package_id: input.release.package_id,
          detail: 'Lifecycle stage_update was blocked.',
        }),
      };
    }

    let backupPath: string | undefined;
    try {
      backupPath = resolveRollbackPath(this.options.runtime, input.target);
      const materialized = await materializePackage({
        runtime: this.options.runtime,
        release: input.release,
        target: input.target,
        createBackup: true,
      });
      writes.push(...materialized.writes);
      backupPath = materialized.backupPath;
    } catch (error) {
      const rollbackUpdate = await this.options.lifecycleOrchestrator.rollbackUpdate(
        buildLifecycleRequest({
          installRequest: input.installRequest,
          release: input.release,
          transition: 'rollback_update',
          currentState: input.currentState,
        }),
      );
      appendResult(lifecycleResults, rollbackUpdate);
      if (!(error instanceof MaterializationError) || error.rollbackNeeded) {
        writes.push(
          ...(await rollbackMaterializedPackage({
            runtime: this.options.runtime,
            target: input.target,
            selectedVersion: input.release.package_version,
            backupPath: error instanceof MaterializationError ? error.backupPath : backupPath,
          })),
        );
      }
      return {
        ok: false,
        status: 'rolled_back',
        writes,
        lifecycleResults,
        failure: PackageResolutionFailureSchema.parse({
          reason_code: 'PKG-009-INSTALL_WRITE_FAILED',
          package_id: input.release.package_id,
          detail: error instanceof Error ? error.message : String(error),
        }),
      };
    }

    const commitUpdate = await this.options.lifecycleOrchestrator.commitUpdate(
      buildLifecycleRequest({
        installRequest: input.installRequest,
        release: input.release,
        transition: 'commit_update',
        currentState: input.currentState,
      }),
    );
    appendResult(lifecycleResults, commitUpdate);
    if (commitUpdate.decision !== 'allowed') {
      writes.push(
        ...(await rollbackMaterializedPackage({
          runtime: this.options.runtime,
          target: input.target,
          selectedVersion: input.release.package_version,
          backupPath,
        })),
      );
      return {
        ok: false,
        status: 'rolled_back',
        writes,
        lifecycleResults,
        failure: PackageResolutionFailureSchema.parse({
          reason_code:
            commitUpdate.reason_code ?? 'PKG-009-INSTALL_WRITE_FAILED',
          package_id: input.release.package_id,
          detail: 'Lifecycle commit_update did not complete successfully.',
        }),
      };
    }

    if (backupPath && (await this.options.runtime.exists(backupPath))) {
      await this.options.runtime.removePath(backupPath);
    }

    return {
      ok: true,
      writes,
      lifecycleResults,
    };
  }

  private async rollbackPreviouslyAppliedNodes(input: {
    writes: PackageInstallResult['writes'];
    targets: Map<string, CanonicalInstallTarget>;
  }): Promise<PackageInstallResult['writes']> {
    const rollbackWrites: PackageInstallResult['writes'] = [];

    for (const entry of collectAppliedWrites(input.writes)) {
      const target = input.targets.get(entry.package_id);
      if (!target) {
        continue;
      }

      rollbackWrites.push(
        ...(await rollbackMaterializedPackage({
          runtime: this.options.runtime,
          target,
          selectedVersion: entry.selected_version,
        })),
      );
    }

    return rollbackWrites;
  }
}
