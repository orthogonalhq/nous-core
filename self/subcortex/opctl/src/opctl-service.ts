/**
 * OpctlService — IOpctlService implementation.
 * Phase 2.5: Control command handling with anti-replay, confirmation, witness integration.
 */
import type {
  ControlCommandEnvelope,
  ConfirmationProof,
  ConfirmationProofRequest,
  OpctlSubmitResult,
  ScopeSnapshot,
  ControlScope,
  ControlActorType,
  ProjectId,
  ProjectControlState,
  WitnessActor,
} from '@nous/shared';
import {
  OpctlSubmitResultSchema,
  type IWitnessService,
} from '@nous/shared';
import { validateEnvelope } from './envelope.js';
import { issueConfirmationProof, validateConfirmationProof, getRequiredTier } from './confirmation.js';
import { resolveScope } from './scope.js';
import type { ReplayStore } from './replay-store.js';
import type { StartLockStore } from './start-lock.js';
import type { ScopeLockStore } from './scope-lock.js';
import type { ProjectControlStateStore } from './project-control-state.js';

function mapActorToWitness(actor: ControlActorType): WitnessActor {
  if (actor === 'principal') return 'principal';
  if (actor === 'orchestration_agent') return 'orchestration_agent';
  return 'worker_agent';
}

export interface OpctlServiceDeps {
  replayStore: ReplayStore;
  startLockStore: StartLockStore;
  scopeLockStore: ScopeLockStore;
  projectControlStateStore?: ProjectControlStateStore;
  witnessService?: IWitnessService;
}

export class OpctlService {
  constructor(private deps: OpctlServiceDeps) {}

  async submitCommand(
    envelope: ControlCommandEnvelope,
    confirmationProof?: ConfirmationProof,
  ): Promise<OpctlSubmitResult> {
    const validation = await validateEnvelope(envelope, this.deps.replayStore);
    if ('valid' in validation && !validation.valid) {
      return OpctlSubmitResultSchema.parse({
        status: 'rejected',
        control_command_id: envelope.control_command_id,
        reason: validation.reason,
        reason_code: validation.reasonCode,
      });
    }
    const { envelope: validEnvelope } = validation as { envelope: ControlCommandEnvelope };

    const requiredTier = getRequiredTier(validEnvelope.action);
    if (requiredTier !== 'T0') {
      if (!confirmationProof) {
        return OpctlSubmitResultSchema.parse({
          status: 'blocked',
          control_command_id: validEnvelope.control_command_id,
          reason: 'Confirmation proof required',
          reason_code: 'OPCTL-003',
        });
      }
      if (!validateConfirmationProof(confirmationProof, validEnvelope)) {
        return OpctlSubmitResultSchema.parse({
          status: 'blocked',
          control_command_id: validEnvelope.control_command_id,
          reason: 'Invalid or expired confirmation proof',
          reason_code: 'OPCTL-003',
        });
      }
    }

    const snapshot = resolveScope(validEnvelope.scope);
    const scopeKey = snapshot.target_ids_hash;

    // Arbitration: acquire lock per scope before apply; block lower-precedence commands
    const lockResult = await this.deps.scopeLockStore.acquire(
      scopeKey,
      validEnvelope.action,
      validEnvelope.control_command_id,
    );
    if (lockResult.acquired === false) {
      return OpctlSubmitResultSchema.parse({
        status: 'blocked',
        control_command_id: validEnvelope.control_command_id,
        reason: `Concurrent command conflict: holder has higher precedence (${lockResult.holderAction})`,
        reason_code: 'opctl_conflict_resolved',
      });
    }
    try {
      // Mark as used before apply (idempotency: replay would have been caught above)
      const { replayStore } = this.deps;
      await replayStore.markCommandIdUsed(validEnvelope.control_command_id);
      await replayStore.markNonceUsed(validEnvelope.nonce);
      await replayStore.setActorSeq(validEnvelope.actor_session_id, validEnvelope.actor_seq);

      // Witness write for non-emergency
      const isEmergencyHardStop =
        validEnvelope.action === 'hard_stop' && !this.deps.witnessService;
      if (!isEmergencyHardStop && this.deps.witnessService) {
        try {
          const authEvent = await this.deps.witnessService.appendAuthorization({
            actionCategory: 'opctl-command',
            actionRef: 'opctl_command_received',
            projectId: validEnvelope.scope.project_id,
            actor: mapActorToWitness(validEnvelope.actor_type),
            status: 'approved',
            detail: {
              control_command_id: validEnvelope.control_command_id,
              action: validEnvelope.action,
              target_ids_hash: snapshot.target_ids_hash,
            },
          });
          await this.deps.witnessService.appendCompletion({
            actionCategory: 'opctl-command',
            actionRef: 'opctl_applied',
            authorizationRef: authEvent.id,
            projectId: validEnvelope.scope.project_id,
            actor: mapActorToWitness(validEnvelope.actor_type),
            status: 'succeeded',
            detail: {
              control_command_id: validEnvelope.control_command_id,
              target_ids_hash: snapshot.target_ids_hash,
            },
          });
        } catch {
          return OpctlSubmitResultSchema.parse({
            status: 'blocked',
            control_command_id: validEnvelope.control_command_id,
            reason: 'Witness write failed',
            reason_code: 'OPCTL-006',
          });
        }
      } else if (!isEmergencyHardStop && !this.deps.witnessService) {
        return OpctlSubmitResultSchema.parse({
          status: 'blocked',
          control_command_id: validEnvelope.control_command_id,
          reason: 'Witness service unavailable',
          reason_code: 'OPCTL-006',
        });
      }

      // Apply state changes for project_run scope (Phase 2.6)
      const projectId = validEnvelope.scope.project_id;
      if (projectId && this.deps.projectControlStateStore) {
        const store = this.deps.projectControlStateStore;
        if (validEnvelope.action === 'pause') {
          await store.set(projectId, 'paused_review');
        } else if (validEnvelope.action === 'resume') {
          await store.set(projectId, 'running');
        } else if (validEnvelope.action === 'hard_stop') {
          await this.deps.startLockStore.setStartLock(projectId, true);
          await store.clear(projectId);
        }
      } else if (
        projectId &&
        validEnvelope.action === 'hard_stop' &&
        this.deps.startLockStore
      ) {
        await this.deps.startLockStore.setStartLock(projectId, true);
      }

      if (isEmergencyHardStop) {
        return OpctlSubmitResultSchema.parse({
          status: 'applied',
          control_command_id: validEnvelope.control_command_id,
          target_ids_hash: snapshot.target_ids_hash,
          degraded_integrity: true,
        });
      }

      return OpctlSubmitResultSchema.parse({
        status: 'applied',
        control_command_id: validEnvelope.control_command_id,
        target_ids_hash: snapshot.target_ids_hash,
      });
    } finally {
      this.deps.scopeLockStore.release(scopeKey);
    }
  }

  async requestConfirmationProof(
    params: ConfirmationProofRequest,
  ): Promise<ConfirmationProof> {
    return issueConfirmationProof(params);
  }

  async validateConfirmationProof(
    proof: ConfirmationProof,
    envelope: ControlCommandEnvelope,
  ): Promise<boolean> {
    return validateConfirmationProof(proof, envelope);
  }

  async resolveScope(scope: ControlScope): Promise<ScopeSnapshot> {
    return resolveScope(scope);
  }

  async hasStartLock(projectId: ProjectId): Promise<boolean> {
    return this.deps.startLockStore.hasStartLock(projectId);
  }

  async setStartLock(
    projectId: ProjectId,
    locked: boolean,
    actor: ControlActorType,
  ): Promise<void> {
    if (actor !== 'principal' && !locked) {
      throw new Error('Only principal may release start lock');
    }
    await this.deps.startLockStore.setStartLock(projectId, locked);
    if (!locked && this.deps.projectControlStateStore) {
      await this.deps.projectControlStateStore.clear(projectId);
    }
  }

  async getProjectControlState(projectId: ProjectId): Promise<ProjectControlState> {
    if (await this.deps.startLockStore.hasStartLock(projectId)) {
      return 'hard_stopped';
    }
    const stored = this.deps.projectControlStateStore
      ? await this.deps.projectControlStateStore.get(projectId)
      : null;
    if (stored === 'paused_review' || stored === 'resuming') {
      return stored;
    }
    return 'running';
  }
}
