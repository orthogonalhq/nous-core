/**
 * Chat control router implementation.
 *
 * Phase 5.2 — Project-Chat-Cortex Control-Plane Runtime Binding.
 * PCP-008: scratch_thread must be non_executable until explicit bind.
 * PCP-009: Executable/control actions must originate from bound non-scratch thread.
 */
import type {
  ChatTurnEnvelope,
  ProjectChatThread,
  ControlCommandEnvelope,
  ConfirmationProof,
} from '@nous/shared';
import type { IChatControlRouter, IOpctlService } from '@nous/shared';
import type { InvariantCode } from '@nous/shared';

const PCP_008: InvariantCode = 'PCP-008';
const PCP_009: InvariantCode = 'PCP-009';

export class ChatControlRouter implements IChatControlRouter {
  constructor(private readonly opctl?: IOpctlService) {}

  async routeControlIntent(
    _turnEnvelope: ChatTurnEnvelope,
    thread: ProjectChatThread,
    _commandEnvelope: ControlCommandEnvelope,
    _confirmationProof?: ConfirmationProof,
  ): Promise<{
    allowed: boolean;
    reasonCode?: string;
    evidenceRefs?: string[];
  }> {
    // PCP-008: scratch_thread must be non_executable until explicit bind
    if (thread.authority_mode === 'non_executable') {
      return {
        allowed: false,
        reasonCode: PCP_008,
        evidenceRefs: ['scratch thread cannot issue control intents'],
      };
    }

    // PCP-009: Must originate from bound non-scratch thread
    if (thread.binding_kind === 'scratch' || !thread.binding_ref) {
      return {
        allowed: false,
        reasonCode: PCP_009,
        evidenceRefs: ['thread must be bound for control intents'],
      };
    }

    // When opctl present, delegate to submitCommand (caller responsibility)
    // This guard only validates thread; actual submission is caller's
    return { allowed: true };
  }
}
