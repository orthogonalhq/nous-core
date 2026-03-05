import {
  PackageLifecycleTransitionRequestSchema,
  type IPackageLifecycleOrchestrator,
  type PackageLifecycleDecisionEvent,
  type PackageLifecycleReasonCode,
  type PackageLifecycleSourceState,
  type PackageLifecycleState,
  type PackageLifecycleStateRecord,
  type PackageLifecycleTransition,
  type PackageLifecycleTransitionRequest,
  type PackageLifecycleTransitionResult,
} from '@nous/shared';
import {
  handleSimpleAllowedTransition,
  resolveBlockedState,
  resolveTrustScope,
} from './handlers.js';
import {
  InMemoryPackageLifecycleEvidenceEmitter,
  type PackageLifecycleEvidenceEmitter,
} from './evidence-emitter.js';
import {
  InMemoryPackageLifecycleStateStore,
  LifecycleStateConflictError,
} from './state-store.js';
import { isTransitionAllowed, resolveTransitionTargetState } from './transition-matrix.js';
import {
  evaluateRemoveGuards,
  evaluateTransitionGuards,
} from './transition-validator.js';
import {
  PackageUpdateController,
  type CommitUpdateOutcome,
} from './update-controller.js';

const defaultNow = (): Date => new Date();

const buildEvidenceRefs = (event: PackageLifecycleDecisionEvent): string[] => [
  `event:${event.event_type}`,
  `witness:${event.witness_ref}`,
];

const resolveAllowedEventType = (
  transition: PackageLifecycleTransition,
  decision: 'allowed' | 'rolled_back' | 'disabled',
): PackageLifecycleDecisionEvent['event_type'] => {
  if (decision === 'rolled_back' || decision === 'disabled') {
    return 'pkg_update_rolled_back';
  }

  switch (transition) {
    case 'ingest':
      return 'pkg_ingest_received';
    case 'install':
      return 'pkg_compatibility_evaluated';
    case 'enable':
      return 'pkg_enabled';
    case 'stage_update':
      return 'pkg_update_staged';
    case 'commit_update':
      return 'pkg_update_committed';
    case 'rollback_update':
      return 'pkg_update_rolled_back';
    case 'export':
      return 'pkg_exported';
    case 'import':
      return 'pkg_import_verified';
    case 'remove':
      return 'pkg_removed';
    case 'run':
      return 'pkg_runtime_action_decided';
    case 'disable':
      return 'pkg_enable_blocked';
    default: {
      const exhaustiveCheck: never = transition;
      throw new Error(`Unhandled transition for event mapping: ${exhaustiveCheck}`);
    }
  }
};

const resolveBlockedEventType = (
  transition: PackageLifecycleTransition,
): PackageLifecycleDecisionEvent['event_type'] => {
  switch (transition) {
    case 'enable':
      return 'pkg_enable_blocked';
    case 'import':
      return 'pkg_import_rejected';
    case 'stage_update':
    case 'commit_update':
    case 'rollback_update':
      return 'pkg_update_rolled_back';
    case 'install':
      return 'pkg_capability_blocked';
    default:
      return 'pkg_runtime_action_decided';
  }
};

export interface PackageLifecycleOrchestratorOptions {
  stateStore?: InMemoryPackageLifecycleStateStore;
  evidenceEmitter?: PackageLifecycleEvidenceEmitter;
  updateController?: PackageUpdateController;
  now?: () => Date;
}

interface TransitionContext {
  request: PackageLifecycleTransitionRequest;
  current: PackageLifecycleStateRecord | null;
  fromState: PackageLifecycleSourceState;
}

interface TransitionOutcome {
  decision: 'allowed' | 'blocked' | 'rolled_back' | 'disabled';
  toState: PackageLifecycleState;
  reasonCode?: PackageLifecycleReasonCode;
  packageVersion: string;
  previousSafeVersion?: string;
  updateSnapshotRef?: ReturnType<PackageUpdateController['getSnapshot']>;
}

export class PackageLifecycleOrchestrator implements IPackageLifecycleOrchestrator {
  private readonly stateStore: InMemoryPackageLifecycleStateStore;
  private readonly evidenceEmitter: PackageLifecycleEvidenceEmitter;
  private readonly updateController: PackageUpdateController;
  private readonly now: () => Date;

  constructor(options: PackageLifecycleOrchestratorOptions = {}) {
    this.stateStore = options.stateStore ?? new InMemoryPackageLifecycleStateStore();
    this.evidenceEmitter =
      options.evidenceEmitter ?? new InMemoryPackageLifecycleEvidenceEmitter();
    this.updateController = options.updateController ?? new PackageUpdateController();
    this.now = options.now ?? defaultNow;
  }

  async ingest(
    request: PackageLifecycleTransitionRequest,
  ): Promise<PackageLifecycleTransitionResult> {
    return this.executeTransition('ingest', request, async (context) => ({
      ...handleSimpleAllowedTransition('ingested'),
      packageVersion: context.request.package_version,
    }));
  }

  async install(
    request: PackageLifecycleTransitionRequest,
  ): Promise<PackageLifecycleTransitionResult> {
    return this.executeTransition('install', request, async (context) => {
      const guardFailure = evaluateTransitionGuards(context.request);
      if (guardFailure) {
        return {
          decision: 'blocked',
          toState: resolveBlockedState(context.fromState, guardFailure),
          reasonCode: guardFailure,
          packageVersion: context.request.package_version,
        };
      }

      return {
        ...handleSimpleAllowedTransition('installed'),
        packageVersion: context.request.package_version,
      };
    });
  }

  async enable(
    request: PackageLifecycleTransitionRequest,
  ): Promise<PackageLifecycleTransitionResult> {
    return this.executeTransition('enable', request, async (context) => {
      const guardFailure = evaluateTransitionGuards(context.request);
      if (guardFailure) {
        return {
          decision: 'blocked',
          toState: resolveBlockedState(context.fromState, guardFailure),
          reasonCode: guardFailure,
          packageVersion: context.request.package_version,
        };
      }

      return {
        ...handleSimpleAllowedTransition('enabled'),
        packageVersion: context.request.package_version,
      };
    });
  }

  async stageUpdate(
    request: PackageLifecycleTransitionRequest,
  ): Promise<PackageLifecycleTransitionResult> {
    return this.executeTransition('stage_update', request, async (context) => {
      const guardFailure = evaluateTransitionGuards(context.request);
      if (guardFailure) {
        return {
          decision: 'blocked',
          toState: resolveBlockedState(context.fromState, guardFailure),
          reasonCode: guardFailure,
          packageVersion: context.request.package_version,
        };
      }

      if (!context.current) {
        return {
          decision: 'blocked',
          toState: 'quarantined',
          reasonCode: 'PKG-005-INVALID_TRANSITION',
          packageVersion: context.request.package_version,
        };
      }

      const stage = this.updateController.stage(context.current, context.request);
      if (!stage.ok || !stage.snapshot) {
        return {
          decision: 'blocked',
          toState: resolveBlockedState(context.fromState, 'PKG-005-INVALID_TRANSITION'),
          reasonCode: stage.reasonCode ?? 'PKG-005-INVALID_TRANSITION',
          packageVersion: context.request.package_version,
        };
      }

      return {
        ...handleSimpleAllowedTransition('update_staged'),
        packageVersion: context.current.package_version,
        previousSafeVersion: context.current.package_version,
        updateSnapshotRef: stage.snapshot,
      };
    });
  }

  async commitUpdate(
    request: PackageLifecycleTransitionRequest,
  ): Promise<PackageLifecycleTransitionResult> {
    return this.executeTransition('commit_update', request, async (context) => {
      const guardFailure = evaluateTransitionGuards(context.request);
      if (guardFailure) {
        return {
          decision: 'blocked',
          toState: resolveBlockedState(context.fromState, guardFailure),
          reasonCode: guardFailure,
          packageVersion: context.request.package_version,
        };
      }

      const commit = this.updateController.commit(context.request);
      return this.mapCommitOutcome(commit);
    });
  }

  async rollbackUpdate(
    request: PackageLifecycleTransitionRequest,
  ): Promise<PackageLifecycleTransitionResult> {
    return this.executeTransition('rollback_update', request, async (context) => {
      const rollback = this.updateController.rollback(
        context.request,
        context.current?.package_version ?? context.request.package_version,
      );
      return this.mapCommitOutcome(rollback);
    });
  }

  async exportPackage(
    request: PackageLifecycleTransitionRequest,
  ): Promise<PackageLifecycleTransitionResult> {
    return this.executeTransition('export', request, async (context) => ({
      ...handleSimpleAllowedTransition(
        resolveTransitionTargetState('export', context.fromState),
      ),
      packageVersion:
        context.current?.package_version ?? context.request.package_version,
      previousSafeVersion: context.current?.previous_safe_version,
    }));
  }

  async importPackage(
    request: PackageLifecycleTransitionRequest,
  ): Promise<PackageLifecycleTransitionResult> {
    return this.executeTransition('import', request, async (context) => {
      const guardFailure = evaluateTransitionGuards(context.request);
      if (guardFailure) {
        return {
          decision: 'blocked',
          toState: resolveBlockedState(context.fromState, guardFailure),
          reasonCode: guardFailure,
          packageVersion: context.request.package_version,
        };
      }

      return {
        ...handleSimpleAllowedTransition('import_verified'),
        packageVersion: context.request.package_version,
      };
    });
  }

  async removePackage(
    request: PackageLifecycleTransitionRequest,
  ): Promise<PackageLifecycleTransitionResult> {
    return this.executeTransition('remove', request, async (context) => {
      const removeFailure = evaluateRemoveGuards(context.request);
      if (removeFailure) {
        return {
          decision: 'blocked',
          toState: resolveBlockedState(context.fromState, removeFailure),
          reasonCode: removeFailure,
          packageVersion:
            context.current?.package_version ?? context.request.package_version,
        };
      }

      return {
        ...handleSimpleAllowedTransition('removed'),
        packageVersion:
          context.current?.package_version ?? context.request.package_version,
        previousSafeVersion: context.current?.previous_safe_version,
      };
    });
  }

  async getState(
    projectId: string,
    packageId: string,
  ): Promise<PackageLifecycleStateRecord | null> {
    return this.stateStore.get(projectId, packageId);
  }

  private async executeTransition(
    expectedTransition: PackageLifecycleTransition,
    input: PackageLifecycleTransitionRequest,
    resolver: (context: TransitionContext) => Promise<TransitionOutcome>,
  ): Promise<PackageLifecycleTransitionResult> {
    const parsed = PackageLifecycleTransitionRequestSchema.safeParse(input);
    if (!parsed.success) {
      return this.buildInvalidInputResult(expectedTransition, input);
    }

    const request = parsed.data;
    if (request.target_transition !== expectedTransition) {
      return this.emitResult({
        request,
        transition: expectedTransition,
        fromState: 'none',
        outcome: {
          decision: 'blocked',
          toState: 'quarantined',
          reasonCode: 'PKG-005-INVALID_TRANSITION',
          packageVersion: request.package_version,
        },
        current: null,
      });
    }

    const current = await this.stateStore.get(request.project_id, request.package_id);
    const fromState: PackageLifecycleSourceState =
      current?.current_state ?? 'none';

    if (!isTransitionAllowed(fromState, expectedTransition)) {
      return this.emitResult({
        request,
        transition: expectedTransition,
        fromState,
        outcome: {
          decision: 'blocked',
          toState: resolveBlockedState(fromState, 'PKG-005-INVALID_TRANSITION'),
          reasonCode: 'PKG-005-INVALID_TRANSITION',
          packageVersion: current?.package_version ?? request.package_version,
        },
        current,
      });
    }

    const outcome = await resolver({ request, current, fromState });
    return this.emitResult({
      request,
      transition: expectedTransition,
      fromState,
      outcome,
      current,
    });
  }

  private mapCommitOutcome(outcome: CommitUpdateOutcome): TransitionOutcome {
    switch (outcome.decision) {
      case 'allowed':
        return {
          decision: 'allowed',
          toState: outcome.toState,
          packageVersion: outcome.packageVersion,
        };
      case 'rolled_back':
        return {
          decision: 'rolled_back',
          toState: outcome.toState,
          reasonCode: outcome.reasonCode ?? 'PKG-004-MIGRATION_FAILED',
          packageVersion: outcome.packageVersion,
        };
      case 'disabled':
        return {
          decision: 'disabled',
          toState: outcome.toState,
          reasonCode:
            outcome.reasonCode ?? 'PKG-004-ROLLBACK_TRUST_CHECK_FAILED',
          packageVersion: outcome.packageVersion,
        };
      case 'blocked':
      default:
        return {
          decision: 'blocked',
          toState: outcome.toState,
          reasonCode: outcome.reasonCode ?? 'PKG-005-INVALID_TRANSITION',
          packageVersion: outcome.packageVersion,
        };
    }
  }

  private async emitResult(input: {
    request: PackageLifecycleTransitionRequest;
    transition: PackageLifecycleTransition;
    fromState: PackageLifecycleSourceState;
    outcome: TransitionOutcome;
    current: PackageLifecycleStateRecord | null;
  }): Promise<PackageLifecycleTransitionResult> {
    const { request, transition, fromState, outcome, current } = input;
    const eventType =
      outcome.decision === 'allowed' ||
      outcome.decision === 'rolled_back' ||
      outcome.decision === 'disabled'
        ? resolveAllowedEventType(transition, outcome.decision)
        : resolveBlockedEventType(transition);

    const event = await this.evidenceEmitter.emit({
      event_type: eventType,
      package_id: request.package_id,
      package_version: outcome.packageVersion,
      origin_class: request.origin_class,
      ...(outcome.reasonCode ? { reason_code: outcome.reasonCode } : {}),
    });

    if (!event.witness_ref) {
      const fallbackEvent = await this.evidenceEmitter.emit({
        event_type: resolveBlockedEventType(transition),
        package_id: request.package_id,
        package_version: outcome.packageVersion,
        origin_class: request.origin_class,
        reason_code: 'PKG-005-MISSING_WITNESS_REF',
      });

      return {
        decision: 'blocked',
        transition,
        from_state: fromState,
        to_state: resolveBlockedState(fromState, 'PKG-005-MISSING_WITNESS_REF'),
        reason_code: 'PKG-005-MISSING_WITNESS_REF',
        witness_ref: fallbackEvent.witness_ref,
        evidence_refs: buildEvidenceRefs(fallbackEvent),
        ...(current ? { state_record: current } : {}),
      };
    }

    const shouldPersistState =
      outcome.decision !== 'blocked' ||
      outcome.toState === 'quarantined' ||
      outcome.toState === 'disabled';

    let stateRecord: PackageLifecycleStateRecord | undefined;
    if (shouldPersistState) {
      const nextVersion = (current?.version ?? 0) + 1;
      const nextStateRecord: PackageLifecycleStateRecord = {
        project_id: request.project_id,
        package_id: request.package_id,
        package_version: outcome.packageVersion,
        origin_class: request.origin_class,
        current_state: outcome.toState,
        ...(outcome.previousSafeVersion || current?.previous_safe_version
          ? {
              previous_safe_version:
                outcome.previousSafeVersion ?? current?.previous_safe_version,
            }
          : {}),
        trust_scope: resolveTrustScope(request, outcome.toState),
        ...(outcome.reasonCode ? { last_reason_code: outcome.reasonCode } : {}),
        last_witness_ref: event.witness_ref,
        version: nextVersion,
        updated_at: this.now().toISOString(),
      };

      try {
        stateRecord = await this.stateStore.upsert(
          nextStateRecord,
          current?.version,
        );
      } catch (error) {
        if (error instanceof LifecycleStateConflictError) {
          const conflictEvent = await this.evidenceEmitter.emit({
            event_type: resolveBlockedEventType(transition),
            package_id: request.package_id,
            package_version: request.package_version,
            origin_class: request.origin_class,
            reason_code: 'PKG-005-INVALID_TRANSITION',
          });

          return {
            decision: 'blocked',
            transition,
            from_state: fromState,
            to_state: resolveBlockedState(fromState, 'PKG-005-INVALID_TRANSITION'),
            reason_code: 'PKG-005-INVALID_TRANSITION',
            witness_ref: conflictEvent.witness_ref,
            evidence_refs: buildEvidenceRefs(conflictEvent),
            ...(current ? { state_record: current } : {}),
          };
        }
        throw error;
      }
    }

    return {
      decision: outcome.decision,
      transition,
      from_state: fromState,
      to_state: outcome.toState,
      ...(outcome.reasonCode ? { reason_code: outcome.reasonCode } : {}),
      witness_ref: event.witness_ref,
      evidence_refs: buildEvidenceRefs(event),
      ...(stateRecord ? { state_record: stateRecord } : {}),
      ...(outcome.updateSnapshotRef
        ? { update_snapshot: outcome.updateSnapshotRef }
        : {}),
    };
  }

  private async buildInvalidInputResult(
    transition: PackageLifecycleTransition,
    input: PackageLifecycleTransitionRequest,
  ): Promise<PackageLifecycleTransitionResult> {
    const packageId =
      typeof input.package_id === 'string' && input.package_id.length > 0
        ? input.package_id
        : 'invalid-package';
    const packageVersion =
      typeof input.package_version === 'string' && input.package_version.length > 0
        ? input.package_version
        : '0.0.0';
    const originClass =
      input.origin_class && typeof input.origin_class === 'string'
        ? input.origin_class
        : 'third_party_external';

    const event = await this.evidenceEmitter.emit({
      event_type: resolveBlockedEventType(transition),
      package_id: packageId,
      package_version: packageVersion,
      origin_class: originClass,
      reason_code: 'PKG-005-INVALID_TRANSITION',
    });

    return {
      decision: 'blocked',
      transition,
      from_state: 'none',
      to_state: 'quarantined',
      reason_code: 'PKG-005-INVALID_TRANSITION',
      witness_ref: event.witness_ref,
      evidence_refs: buildEvidenceRefs(event),
    };
  }
}
