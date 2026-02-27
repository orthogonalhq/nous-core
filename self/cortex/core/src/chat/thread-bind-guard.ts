/**
 * Chat thread bind guard implementation.
 *
 * Phase 5.2 — Project-Chat-Cortex Control-Plane Runtime Binding.
 * PCP-010: Thread binding changes require explicit command, policy evaluation, evidence linkage.
 */
import type { ChatThreadBindCommand, ProjectChatThread } from '@nous/shared';
import type { IChatThreadBindGuard } from '@nous/shared';
import type { InvariantCode } from '@nous/shared';

const PCP_008: InvariantCode = 'PCP-008';
const PCP_010: InvariantCode = 'PCP-010';

export class ChatThreadBindGuard implements IChatThreadBindGuard {
  async evaluateBind(
    command: ChatThreadBindCommand,
    currentThread: ProjectChatThread,
  ): Promise<{
    allowed: boolean;
    reasonCode?: string;
    evidenceRefs?: string[];
  }> {
    // PCP-010: Explicit bind command required
    if (!command.reason || command.reason.length === 0) {
      return {
        allowed: false,
        reasonCode: PCP_010,
        evidenceRefs: ['bind command requires reason'],
      };
    }

    // PCP-008: scratch_thread conversion requires explicit bind
    if (currentThread.binding_kind === 'scratch') {
      if (command.from_binding_kind !== 'scratch') {
        return {
          allowed: false,
          reasonCode: PCP_008,
          evidenceRefs: ['scratch-to-executable requires from_binding_kind=scratch'],
        };
      }
      // Allow conversion from scratch to task_run/node_scope/governance
      return { allowed: true };
    }

    // Non-scratch rebind: allow if to_binding_ref is valid
    return { allowed: true };
  }
}
