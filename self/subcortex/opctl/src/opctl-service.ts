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
  if (actor === 'system_agent') return 'subcortex';
  if (actor === 'supervisor') return 'supervisor';
  return 'worker_agent';
}

/**
 * WR-162 SP 5 — SUPV-SP5-011 supervisor-actor authorization allowlist.
 *
 * Supervisor-actor commands are restricted to the enforcement action set
 * named in `supervisor-escalation-policy-v1.md § Enforcement Actions`:
 * `hard_stop`, `pause`, `stop_response`. Every other action is rejected
 * with `reason_code: 'supervisor_actor_forbidden_action'`. UX aliases
 * (`retry_step`, `revert_to_previous_state`, `edit_submitted_prompt`)
 * fall into the forbidden set because they are user-surface aliases
 * that have no supervisor policy semantics.
 */
const SUPERVISOR_ACTOR_ALLOWED_ACTIONS: ReadonlySet<string> = new Set([
  'hard_stop',
  'pause',
  'stop_response',
]);

function validateSupervisorActorAuthorization(
  envelope: ControlCommandEnvelope,
): { ok: true } | { ok: false; reasonCode: 'supervisor_actor_forbidden_action' } {
  if (envelope.actor_type !== 'supervisor') return { ok: true };
  if (SUPERVISOR_ACTOR_ALLOWED_ACTIONS.has(envelope.action)) return { ok: true };
  return { ok: false, reasonCode: 'supervisor_actor_forbidden_action' };
}

/**
 * WR-162 SP 5 — payload shape expected on supervisor-actor envelopes for
 * the lock-write branch (SUPV-SP5-009). The enforcement layer populates
 * these fields; opctl reads them verbatim. Missing / malformed payload
 * causes the write to fall back to best-effort defaults (the supervisor
 * layer guarantees shape via its own envelope construction).
 */
interface SupervisorActorLockPayload {
  sup_code?: string;
  severity?: string;
  lock_set_at?: string;
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

    // WR-162 SP 5 — SUPV-SP5-011. Supervisor-actor allowlist check runs
    // AFTER envelope validation and BEFORE arbitration: forbidden actions
    // (supervisor trying `resume` / `cancel` / `retry` / aliases / …) fail
    // fast with `supervisor_actor_forbidden_action` and never consume a
    // scope-lock slot.
    const supervisorActorCheck = validateSupervisorActorAuthorization(validEnvelope);
    if (supervisorActorCheck.ok === false) {
      return OpctlSubmitResultSchema.parse({
        status: 'rejected',
        control_command_id: validEnvelope.control_command_id,
        reason: `Supervisor actor cannot issue '${validEnvelope.action}' commands`,
        reason_code: supervisorActorCheck.reasonCode,
      });
    }

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
        // WR-162 SP 5 — SUPV-SP5-010. ESC-001 resume-lock gate. Runs at
        // the top of the project-run scope state-apply branch, before
        // the `resume` handler. Only a principal-authored resume (with
        // a valid T3 proof — already validated above at line ~72) may
        // clear the supervisor enforcement lock. Supervisor self-resume
        // is blocked by SUPV-SP5-011 allowlist earlier; this gate blocks
        // operator / orchestrator / worker / system-agent resume on a
        // scope that a supervisor has locked.
        if (validEnvelope.action === 'resume') {
          const lockState = await store.getSupervisorLock(projectId);
          if (lockState.locked && validEnvelope.actor_type !== 'principal') {
            return OpctlSubmitResultSchema.parse({
              status: 'rejected',
              control_command_id: validEnvelope.control_command_id,
              reason: 'Supervisor enforcement lock active; principal T3 resume required',
              reason_code: 'supervisor_enforcement_lock',
            });
          }
        }
        if (validEnvelope.action === 'pause') {
          await store.set(projectId, 'paused_review');
        } else if (validEnvelope.action === 'resume') {
          await this.deps.startLockStore.setStartLock(projectId, false);
          await store.set(projectId, 'resuming');
          // WR-162 SP 5 — SUPV-SP5-010. Atomic clear on principal-
          // authorized resume apply. The resume-lock gate above
          // guarantees we reach this branch only when the actor is
          // `principal` AND the T3 proof validated AND any supervisor
          // lock (if present) must be cleared alongside the state
          // transition. When no lock was set, the clear is a no-op.
          await store.clearSupervisorLock(projectId);
        } else if (validEnvelope.action === 'hard_stop') {
          await this.deps.startLockStore.setStartLock(projectId, true);
          await store.clear(projectId);
        }
        // WR-162 SP 5 — SUPV-SP5-009. Supervisor-actor lock write.
        // Runs AFTER the state-apply branches so the lock captures the
        // enforcement action that just succeeded. `pause` → state is
        // `paused_review` + lock set. `hard_stop` → startLock + lock
        // set (state is cleared by the hard_stop branch, which is
        // expected: hard_stopped is derived from startLockStore).
        // `stop_response` has no state-apply branch (it is consumer-
        // path only), but we still set the lock so ESC-001 applies.
        if (validEnvelope.actor_type === 'supervisor') {
          const payload = (validEnvelope.payload ?? {}) as SupervisorActorLockPayload;
          await store.setSupervisorLock(projectId, {
            sup_code: payload.sup_code ?? '',
            severity: payload.severity ?? '',
            set_at: payload.lock_set_at ?? new Date().toISOString(),
          });
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
