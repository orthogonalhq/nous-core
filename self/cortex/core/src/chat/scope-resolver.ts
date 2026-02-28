/**
 * Chat scope resolver implementation.
 *
 * Phase 5.2 — Project-Chat-Cortex Control-Plane Runtime Binding.
 * PCP-002: Executable/control intents must resolve to explicit project scope.
 * PCP-007: Project paused_review|hard_stopped blocks chat-initiated dispatch.
 */
import type { ChatTurnEnvelope, ScopeResolutionResult } from '@nous/shared';
import type { IChatScopeResolver, IOpctlService } from '@nous/shared';
import type { ProjectId } from '@nous/shared';
import type { InvariantCode } from '@nous/shared';

const PCP_002: InvariantCode = 'PCP-002';
const PCP_007: InvariantCode = 'PCP-007';

export class ChatScopeResolver implements IChatScopeResolver {
  constructor(private readonly opctl?: IOpctlService) {}

  async resolve(
    envelope: ChatTurnEnvelope,
    requiresExecutableScope: boolean,
  ): Promise<ScopeResolutionResult> {
    // PCP-002: Executable/control intents must resolve to explicit project scope
    if (!envelope.project_id) {
      return {
        resolved: false,
        reasonCode: PCP_002,
        evidenceRefs: ['project_id required for executable/control scope'],
      };
    }

    if (!requiresExecutableScope) {
      return {
        resolved: true,
        project_id: envelope.project_id,
        run_id: envelope.run_id ?? null,
      };
    }

    // PCP-007: Block when control state is paused_review or hard_stopped
    if (this.opctl) {
      const controlState = await this.opctl.getProjectControlState(
        envelope.project_id as ProjectId,
      );
      if (controlState === 'hard_stopped' || controlState === 'paused_review') {
        return {
          resolved: false,
          reasonCode: PCP_007,
          evidenceRefs: [`control_state=${controlState} blocks dispatch`],
        };
      }
    } else {
      // No opctl: fail-closed (cannot determine control state)
      return {
        resolved: false,
        reasonCode: PCP_007,
        evidenceRefs: ['opctl unavailable; cannot verify control state'],
      };
    }

    return {
      resolved: true,
      project_id: envelope.project_id,
      run_id: envelope.run_id ?? null,
    };
  }
}
