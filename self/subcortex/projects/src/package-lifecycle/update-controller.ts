import {
  PackageUpdateStageSnapshotSchema,
  type PackageLifecycleReasonCode,
  type PackageLifecycleStateRecord,
  type PackageLifecycleTransitionRequest,
  type PackageUpdateStageSnapshot,
} from '@nous/shared';

export interface StageUpdateOutcome {
  ok: boolean;
  reasonCode?: PackageLifecycleReasonCode;
  snapshot?: PackageUpdateStageSnapshot;
}

export interface CommitUpdateOutcome {
  decision: 'allowed' | 'rolled_back' | 'disabled' | 'blocked';
  reasonCode?: PackageLifecycleReasonCode;
  toState: 'update_committed' | 'rolled_back' | 'disabled' | 'update_staged';
  packageVersion: string;
}

const buildSnapshotKey = (projectId: string, packageId: string): string =>
  `${projectId}::${packageId}`;

export class PackageUpdateController {
  private readonly snapshots = new Map<string, PackageUpdateStageSnapshot>();
  private readonly now: () => Date;

  constructor(options?: { now?: () => Date }) {
    this.now = options?.now ?? (() => new Date());
  }

  stage(
    current: PackageLifecycleStateRecord,
    request: PackageLifecycleTransitionRequest,
  ): StageUpdateOutcome {
    if (!request.target_version || !request.checkpoint_ref) {
      return {
        ok: false,
        reasonCode: 'PKG-005-INVALID_TRANSITION',
      };
    }

    const snapshot = PackageUpdateStageSnapshotSchema.parse({
      project_id: request.project_id,
      package_id: request.package_id,
      previous_safe_version: current.package_version,
      candidate_version: request.target_version,
      checkpoint_ref: request.checkpoint_ref,
      staged_at: this.now().toISOString(),
    });

    this.snapshots.set(buildSnapshotKey(request.project_id, request.package_id), snapshot);
    return { ok: true, snapshot };
  }

  getSnapshot(
    projectId: string,
    packageId: string,
  ): PackageUpdateStageSnapshot | null {
    const snapshot = this.snapshots.get(buildSnapshotKey(projectId, packageId));
    return snapshot ? structuredClone(snapshot) : null;
  }

  clearSnapshot(projectId: string, packageId: string): void {
    this.snapshots.delete(buildSnapshotKey(projectId, packageId));
  }

  commit(
    request: PackageLifecycleTransitionRequest,
  ): CommitUpdateOutcome {
    const snapshot = this.getSnapshot(request.project_id, request.package_id);
    if (!snapshot) {
      return {
        decision: 'blocked',
        reasonCode: 'PKG-005-INVALID_TRANSITION',
        toState: 'update_staged',
        packageVersion: request.package_version,
      };
    }

    const checks = request.update_checks;
    const failedChecks =
      checks &&
      (!checks.migration_passed || !checks.health_passed || !checks.invariants_passed);
    if (failedChecks) {
      if (request.rollback && !request.rollback.trust_checks_passed) {
        this.clearSnapshot(request.project_id, request.package_id);
        return {
          decision: 'disabled',
          reasonCode: 'PKG-004-ROLLBACK_TRUST_CHECK_FAILED',
          toState: 'disabled',
          packageVersion: snapshot.previous_safe_version,
        };
      }
      this.clearSnapshot(request.project_id, request.package_id);
      return {
        decision: 'rolled_back',
        reasonCode: 'PKG-004-UPDATE_STAGE_CHECK_FAILED',
        toState: 'rolled_back',
        packageVersion: snapshot.previous_safe_version,
      };
    }

    this.clearSnapshot(request.project_id, request.package_id);
    return {
      decision: 'allowed',
      toState: 'update_committed',
      packageVersion: snapshot.candidate_version,
    };
  }

  rollback(
    request: PackageLifecycleTransitionRequest,
    currentVersion: string,
  ): CommitUpdateOutcome {
    const snapshot = this.getSnapshot(request.project_id, request.package_id);
    if (!snapshot) {
      return {
        decision: 'blocked',
        reasonCode: 'PKG-005-INVALID_TRANSITION',
        toState: 'update_staged',
        packageVersion: currentVersion,
      };
    }

    if (request.rollback && !request.rollback.trust_checks_passed) {
      this.clearSnapshot(request.project_id, request.package_id);
      return {
        decision: 'disabled',
        reasonCode: 'PKG-004-ROLLBACK_TRUST_CHECK_FAILED',
        toState: 'disabled',
        packageVersion: snapshot.previous_safe_version,
      };
    }

    this.clearSnapshot(request.project_id, request.package_id);
    return {
      decision: 'rolled_back',
      reasonCode: 'PKG-004-MIGRATION_FAILED',
      toState: 'rolled_back',
      packageVersion: snapshot.previous_safe_version,
    };
  }
}
