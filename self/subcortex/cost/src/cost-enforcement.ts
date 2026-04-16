/**
 * CostEnforcement — Triggers opctl pause when budget hard ceiling is exceeded.
 *
 * Constructs a valid ControlCommandEnvelope and submits via OpctlService.
 * Double-pause prevention: checks project control state before submitting.
 * Uses T0 confirmation tier (no ConfirmationProof required for pause).
 */
import { createHash, randomUUID } from 'node:crypto';
import type {
  ControlCommandEnvelope,
  ControlCommandId,
  ProjectId,
  ProjectControlState,
  OpctlSubmitResult,
} from '@nous/shared';

/**
 * Minimal interface for the OpctlService methods CostEnforcement requires.
 * Avoids a direct package import — the real OpctlService is injected at runtime.
 */
export interface IOpctlServiceForEnforcement {
  getProjectControlState(projectId: ProjectId): Promise<ProjectControlState>;
  submitCommand(envelope: ControlCommandEnvelope): Promise<OpctlSubmitResult>;
}

export interface CostEnforcementDeps {
  opctlService: IOpctlServiceForEnforcement;
}

export interface EnforcementRecord {
  timestamp: number;
  projectId: string;
  spendAtTrigger: number;
  ceilingUsd: number;
  success: boolean;
}

/**
 * Deterministic UUID for the cost-governance-service actor identity.
 * Derived from SHA-256 of 'cost-governance-service', formatted as UUID v5-style
 * with version nibble = 5 and variant bits set per RFC 4122.
 *
 * The result is a stable, reproducible UUID so the same service instance
 * always presents the same actor identity.
 */
function deriveActorId(): string {
  const hash = createHash('sha256').update('cost-governance-service').digest();
  // Copy to avoid mutating the digest buffer
  const bytes = Buffer.from(hash);
  // Set version 5 (bits 4-7 of byte 6)
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  // Set variant 10xx (bits 6-7 of byte 8)
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

export class CostEnforcement {
  private readonly actorId: string;
  private readonly actorSessionId: string;
  private actorSeq = 0;
  private readonly enforcementLog: EnforcementRecord[] = [];

  constructor(private readonly deps: CostEnforcementDeps) {
    this.actorId = deriveActorId();
    this.actorSessionId = randomUUID();
  }

  /**
   * Trigger an opctl pause for the given project due to budget ceiling breach.
   *
   * Double-pause prevention: if the project is already paused_review or
   * hard_stopped, the pause is skipped silently.
   */
  async triggerPause(
    projectId: string,
    spendAtTrigger: number,
    ceilingUsd: number,
  ): Promise<void> {
    // Double-pause prevention: check current state first
    let controlState: ProjectControlState | undefined;
    try {
      controlState = await this.deps.opctlService.getProjectControlState(
        projectId as ProjectId,
      );
    } catch {
      // If state check fails, proceed with pause attempt — let OpctlService validate.
    }

    if (controlState === 'paused_review' || controlState === 'hard_stopped') {
      return; // Already paused or stopped — skip
    }

    const now = new Date();
    const envelope: ControlCommandEnvelope = {
      control_command_id: randomUUID() as ControlCommandId,
      actor_type: 'system_agent',
      actor_id: this.actorId,
      actor_session_id: this.actorSessionId,
      actor_seq: this.nextSeq(),
      nonce: randomUUID(),
      issued_at: now.toISOString(),
      // expires_at: 60s TTL. Same-process command; 60s provides generous window
      // for scope lock acquisition and witness write while remaining short enough
      // for meaningful anti-replay. ADR-004 does not prescribe a specific TTL.
      expires_at: new Date(now.getTime() + 60_000).toISOString(),
      scope: {
        class: 'project_run_scope',
        kind: 'project_run',
        target_ids: [],
        project_id: projectId as ProjectId,
      },
      action: 'pause',
      payload_hash: createHash('sha256')
        .update(JSON.stringify({ action: 'pause', project_id: projectId }))
        .digest('hex'),
      command_signature: 'cost-governance-system-sig',
      payload: {
        reason: 'Budget hard ceiling exceeded',
        spendAtTrigger,
        ceilingUsd,
      },
    };

    let success = true;
    try {
      await this.deps.opctlService.submitCommand(envelope);
    } catch {
      success = false;
    }

    this.enforcementLog.push({
      timestamp: Date.now(),
      projectId,
      spendAtTrigger,
      ceilingUsd,
      success,
    });
  }

  private nextSeq(): number {
    return this.actorSeq++;
  }

  /** Returns a copy of the enforcement log (for diagnostics and tests). */
  getEnforcementLog(): EnforcementRecord[] {
    return [...this.enforcementLog];
  }
}
