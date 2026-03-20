/**
 * Governance hook factory — bridges SDK-agnostic AgentHooks to Nous
 * governance primitives (PFC engine, witness service, MAO projection).
 *
 * This is the key integration point: each adapter calls these hooks, and
 * the hooks delegate to the real Nous governance layer.
 */

import type { IPfcEngine, IWitnessService, ProjectId } from '@nous/shared';
import type { AgentHooks, MaoAgentEvent } from './types.js';

// ---------------------------------------------------------------------------
// Dependency injection — the factory accepts optional governance deps.
// In production these come from the Cortex runtime; in tests they are mocks.
// ---------------------------------------------------------------------------

export interface GovernanceHookDeps {
  /** PFC engine — evaluates whether a tool call is authorized. */
  pfcEngine?: IPfcEngine;
  /** Witness service — records evidence of tool actions. */
  witnessService?: IWitnessService;
  /** MAO event callback — streams events to the MAO panel / projection. */
  onMaoEvent?: (event: MaoAgentEvent) => void;
  /** Optional project ID for scoped governance evaluation. */
  projectId?: string;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates an AgentHooks instance wired to Nous governance primitives.
 *
 * Any dependency that is not provided is silently skipped — this allows
 * incremental adoption (e.g. PFC-only, witness-only, or full governance).
 */
export function createGovernanceHooks(deps: GovernanceHookDeps): AgentHooks {
  const { pfcEngine, witnessService, onMaoEvent, projectId } = deps;

  function emitMaoEvent(event: Omit<MaoAgentEvent, 'timestamp'>): void {
    if (onMaoEvent) {
      onMaoEvent({ ...event, timestamp: new Date().toISOString() });
    }
  }

  return {
    // -----------------------------------------------------------------------
    // PreToolUse → PFC governance gate
    // -----------------------------------------------------------------------
    async onPreToolUse(toolName: string, input: unknown): Promise<'allow' | 'deny'> {
      emitMaoEvent({
        type: 'tool_use_requested',
        toolName,
        data: { input },
      });

      if (!pfcEngine) {
        // No PFC engine → default allow (open governance posture for spike)
        emitMaoEvent({ type: 'tool_use_allowed', toolName, data: { input } });
        return 'allow';
      }

      const decision = await pfcEngine.evaluateToolExecution(
        toolName,
        input,
        projectId as ProjectId | undefined,
      );

      if (decision.approved) {
        emitMaoEvent({ type: 'tool_use_allowed', toolName, data: { input, decision } });
        return 'allow';
      } else {
        emitMaoEvent({ type: 'tool_use_denied', toolName, data: { input, decision } });
        return 'deny';
      }
    },

    // -----------------------------------------------------------------------
    // PostToolUse → Witness chain evidence recording
    // -----------------------------------------------------------------------
    async onPostToolUse(
      toolName: string,
      input: unknown,
      output: unknown,
    ): Promise<void> {
      if (witnessService) {
        // In a full integration the authorizationRef would come from a
        // preceding appendAuthorization() call. For this spike we pass a
        // synthetic ref — the real wiring happens in Phase 1.2.
        await witnessService.appendCompletion({
          actionCategory: 'tool-execute',
          actionRef: `agent-tool:${toolName}:${Date.now()}`,
          // In a full integration, authorizationRef comes from a preceding
          // appendAuthorization() call. Cast needed for branded type.
          authorizationRef: 'spike-synthetic-auth-ref' as unknown as
            Parameters<IWitnessService['appendCompletion']>[0]['authorizationRef'],
          actor: 'system',
          status: 'succeeded',
          detail: { toolName, input, output },
          ...(projectId ? { projectId: projectId as ProjectId } : {}),
        });
      }

      emitMaoEvent({
        type: 'tool_use_completed',
        toolName,
        data: { input, output },
      });
    },

    // -----------------------------------------------------------------------
    // Stop → MAO control surface
    // -----------------------------------------------------------------------
    async onStop(): Promise<void> {
      emitMaoEvent({
        type: 'agent_stopped',
        data: {},
      });
    },

    // -----------------------------------------------------------------------
    // Message → MAO panel streaming
    // -----------------------------------------------------------------------
    onMessage(message: unknown): void {
      emitMaoEvent({
        type: 'agent_message',
        data: message,
      });
    },
  };
}
