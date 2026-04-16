/**
 * Workflow node handler for coding agent node types.
 *
 * Maps `nous.agent.claude` and `nous.agent.codex` workflow spec node types
 * to the corresponding SDK adapters, wiring governance hooks at each step.
 *
 * The runtime adapter maps `nous.agent.*` nodes to `model-call` config type,
 * but this handler provides the actual agent execution semantics — delegating
 * to runClaudeAgent / runCodexAgent rather than a plain model-call.
 */

import type {
  IWorkflowNodeHandler,
  WorkflowNodeExecutionContext,
  WorkflowNodeExecutionResult,
  WorkflowNodeKind,
  IPfcEngine,
  IWitnessService,
} from '@nous/shared';
import type { MaoAgentEvent } from './types.js';
import { createGovernanceHooks } from './governance-hooks.js';
import { runClaudeAgent } from './claude-adapter.js';
import { runCodexAgent } from './codex-adapter.js';

// ---------------------------------------------------------------------------
// Dependency injection
// ---------------------------------------------------------------------------

export interface CodingAgentNodeHandlerDeps {
  /** PFC engine — evaluates whether a tool call is authorized. */
  pfcEngine?: IPfcEngine;
  /** Witness service — records evidence of tool actions. */
  witnessService?: IWitnessService;
  /** MAO event callback — streams events to the MAO panel / projection. */
  onMaoEvent?: (event: MaoAgentEvent) => void;
}

// ---------------------------------------------------------------------------
// Supported agent node types
// ---------------------------------------------------------------------------

/** The declarative spec node types this handler services. */
export const CODING_AGENT_NODE_TYPES = [
  'nous.agent.claude',
  'nous.agent.codex',
] as const;

export type CodingAgentNodeType = (typeof CODING_AGENT_NODE_TYPES)[number];

// ---------------------------------------------------------------------------
// Handler factory
// ---------------------------------------------------------------------------

/**
 * Creates an `IWorkflowNodeHandler` that dispatches to the correct coding
 * agent SDK adapter based on the original spec node type stored in the
 * node config.
 *
 * Because the runtime adapter collapses `nous.agent.*` → `model-call` at
 * the config level, the handler uses the `promptRef` field (which contains
 * `default:nous.agent.claude` or `default:nous.agent.codex`) to determine
 * which adapter to invoke.
 */
export function createCodingAgentNodeHandler(
  deps: CodingAgentNodeHandlerDeps,
): IWorkflowNodeHandler {
  const handler: IWorkflowNodeHandler = {
    nodeType: 'model-call' as WorkflowNodeKind,

    async execute(
      context: WorkflowNodeExecutionContext,
    ): Promise<WorkflowNodeExecutionResult> {
      const config = context.nodeDefinition.config;

      // The runtime adapter maps agent nodes to model-call config.
      // The promptRef field encodes the original spec node type.
      if (config.type !== 'model-call') {
        throw new Error(
          `CodingAgentNodeHandler received non model-call config: ${config.type}`,
        );
      }

      const agentType = resolveAgentType(config.promptRef);
      if (!agentType) {
        throw new Error(
          `Unknown agent node type in promptRef: ${config.promptRef}`,
        );
      }

      const hooks = createGovernanceHooks({
        pfcEngine: deps.pfcEngine,
        witnessService: deps.witnessService,
        onMaoEvent: deps.onMaoEvent,
        projectId: context.projectConfig.id,
      });

      // Extract task parameters from the node definition / payload.
      const params = context.payload ?? {};
      const taskInput = {
        prompt: (params as Record<string, unknown>).prompt as string ?? `Execute workflow node: ${context.nodeDefinition.name}`,
        allowedTools: (params as Record<string, unknown>).allowedTools as string[] | undefined,
        workingDirectory: (params as Record<string, unknown>).workingDirectory as string | undefined,
        maxTurns: (params as Record<string, unknown>).maxTurns as number | undefined,
        model: (params as Record<string, unknown>).model as string | undefined,
      };

      const evidenceRefs = [
        ...context.dispatchLineage.evidenceRefs,
        `workflow_dispatch_lineage_id=${context.dispatchLineage.id}`,
      ];

      try {
        const result = agentType === 'nous.agent.claude'
          ? await runClaudeAgent(taskInput, hooks)
          : await runCodexAgent(taskInput, hooks);

        return {
          outcome: result.success ? 'completed' : 'failed',
          governanceDecision: context.governanceDecision,
          sideEffectStatus: 'unknown_external_effect',
          outputRef: result.finalResponse,
          reasonCode: result.success
            ? 'coding_agent_completed'
            : 'coding_agent_failed',
          evidenceRefs,
        };
      } catch (error) {
        return {
          outcome: 'failed',
          governanceDecision: context.governanceDecision,
          sideEffectStatus: 'none',
          reasonCode: 'coding_agent_error',
          evidenceRefs: [
            ...evidenceRefs,
            `error=${(error as Error).message}`,
          ],
        };
      }
    },
  };

  return handler;
}

// ---------------------------------------------------------------------------
// Registration helper
// ---------------------------------------------------------------------------

/**
 * Registers the coding agent node handler with the workflow runtime's
 * node handler registry.
 *
 * This function adds the handler for the `model-call` node kind, which
 * is the runtime kind that `nous.agent.*` spec nodes map to. In practice,
 * this should be called with a dedicated handler registry (not the default
 * one) to avoid conflicting with the stock ModelCallWorkflowNodeHandler.
 */
export function registerCodingAgentNodeTypes(
  registry: Map<WorkflowNodeKind, IWorkflowNodeHandler>,
  deps: CodingAgentNodeHandlerDeps,
): void {
  const handler = createCodingAgentNodeHandler(deps);
  // Register under the model-call kind — the runtime adapter maps
  // nous.agent.* → model-call. Callers should use a separate registry
  // or override the default model-call handler when coding agent nodes
  // are present in a workflow.
  registry.set('model-call' as WorkflowNodeKind, handler);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolves which agent adapter to use from the config promptRef.
 *
 * The runtime adapter sets promptRef to `default:nous.agent.claude` or
 * `default:nous.agent.codex` (see mapNodeTypeToConfig in runtime-adapter.ts).
 */
function resolveAgentType(promptRef: string): CodingAgentNodeType | null {
  for (const nodeType of CODING_AGENT_NODE_TYPES) {
    if (promptRef.includes(nodeType)) {
      return nodeType;
    }
  }
  return null;
}
