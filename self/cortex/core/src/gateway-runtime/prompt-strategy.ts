/**
 * Prompt Strategy Pattern — per-agent-class prompt resolution.
 *
 * Maps (agentClass, providerId?) to a PromptConfig containing identity,
 * task frame, tool policy, and guardrails. Pure functions, no side effects.
 *
 * Sub-phase 1.1 of WR-124 (Chat Response Quality).
 */
import type { AgentClass, ToolDefinition } from '@nous/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * How tools appear in the system prompt:
 * - 'omit': no tools in prompt text (Principal — tools are not relevant)
 * - 'text-listed': tool names listed in prompt text (System, Orchestrator, Worker)
 * - 'native': tools provided via provider API, not prompt text (future — WR-119)
 */
export type ToolPolicy = 'native' | 'text-listed' | 'omit';

/**
 * Per-agent-class prompt configuration.
 *
 * Captures the four dimensions of prompt content that vary by agent class
 * and (optionally) by provider. Consumed by composeSystemPromptFromConfig
 * to produce a complete system prompt string.
 */
export interface PromptConfig {
  /** Role description — "You are..." identity block */
  readonly identity: string;

  /** What to do with this turn — framing for the agent's task posture */
  readonly taskFrame: string;

  /**
   * How tools appear in the system prompt.
   * @see ToolPolicy
   */
  readonly toolPolicy: ToolPolicy;

  /** Anti-narration, format constraints, behavioral guardrails */
  readonly guardrails: readonly string[];
}

// ---------------------------------------------------------------------------
// Default configs (private — exposed only through resolvePromptConfig)
// ---------------------------------------------------------------------------

const PRINCIPAL_DEFAULT_CONFIG: PromptConfig = {
  identity:
    'You are the conversational gateway for Nous. You respond naturally to the user. ' +
    'You are read-only — you do not execute tools or dispatch agents directly. ' +
    'When the user requests work that requires execution, delegate it through the System inbox.',
  taskFrame:
    'Respond to the user conversationally. If the request requires task execution, ' +
    'delegate the work through the System inbox. Never attempt to execute tasks yourself.',
  toolPolicy: 'omit',
  guardrails: [
    'Do not reference internal framework concepts, agent classes, or runtime architecture.',
    'Do not emit tool-call syntax or structured tool invocations.',
    'Do not expose reasoning chains, planning steps, or internal deliberation.',
    'Respond without blocking — never wait for internal results before replying to the user.',
  ],
};

const SYSTEM_DEFAULT_CONFIG: PromptConfig = {
  identity:
    'You are the executive coordinator for the Nous runtime. ' +
    'You own dispatch, policy enforcement, and lifecycle management. ' +
    'You evaluate inbox submissions and route them to Orchestrators or Workers.',
  taskFrame:
    'Evaluate inbox submissions. Dispatch Orchestrators for complex multi-step work ' +
    'or Workers for bounded tasks. Enforce policy constraints. ' +
    'Do not execute tasks directly — dispatch them.',
  toolPolicy: 'text-listed',
  guardrails: [
    'Produce structured output only — no conversational prose.',
    'Do not block the Principal agent — process asynchronously.',
    'Dispatch work to Orchestrators or Workers; do not execute tasks directly.',
  ],
};

const ORCHESTRATOR_DEFAULT_CONFIG: PromptConfig = {
  identity:
    'You are a project-scoped planner. You decompose complex work into bounded tasks ' +
    'and dispatch them to Workers. You do not execute tasks directly.',
  taskFrame:
    'Decompose the assigned work into bounded tasks. Delegate each task to a Worker. ' +
    'Coordinate results and report completion.',
  toolPolicy: 'text-listed',
  guardrails: [
    'Produce structured plans — no conversational prose.',
    'Delegate all execution to Workers; do not execute tasks directly.',
    'Do not invoke tools for task execution — only for planning and coordination.',
  ],
};

const WORKER_DEFAULT_CONFIG: PromptConfig = {
  identity:
    'You are a bounded execution agent. You perform the assigned task directly ' +
    'and return structured results through task_complete. ' +
    'You do not dispatch other agents or communicate with the user.',
  taskFrame:
    'Execute the assigned task directly. Return results through task_complete ' +
    'with structured output and evidence references.',
  toolPolicy: 'text-listed',
  guardrails: [
    'Produce structured output with evidence references.',
    'You have no dispatch authority — do not spawn or delegate to other agents.',
    'Do not engage in user-facing conversation — return results only.',
    'Complete work through the task_complete lifecycle tool.',
  ],
};

// ---------------------------------------------------------------------------
// resolvePromptConfig
// ---------------------------------------------------------------------------

/**
 * Resolves a PromptConfig for the given agent class and optional provider.
 *
 * Two-axis resolution: switches on agentClass first, then providerId within
 * each class (with 'default' fallback). Pure function, no side effects.
 *
 * @param agentClass - One of the four canonical agent classes
 * @param providerId - Optional provider identifier for per-provider overrides
 * @returns The resolved PromptConfig for this agent class + provider combination
 */
export function resolvePromptConfig(
  agentClass: AgentClass,
  providerId?: string,
): PromptConfig {
  switch (agentClass) {
    case 'Cortex::Principal': {
      switch (providerId) {
        default:
          return PRINCIPAL_DEFAULT_CONFIG;
      }
    }
    case 'Cortex::System': {
      switch (providerId) {
        default:
          return SYSTEM_DEFAULT_CONFIG;
      }
    }
    case 'Orchestrator': {
      switch (providerId) {
        default:
          return ORCHESTRATOR_DEFAULT_CONFIG;
      }
    }
    case 'Worker': {
      switch (providerId) {
        default:
          return WORKER_DEFAULT_CONFIG;
      }
    }
    default: {
      const _exhaustive: never = agentClass;
      throw new Error(
        `resolvePromptConfig: unhandled agent class "${_exhaustive as string}"`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// composeSystemPromptFromConfig
// ---------------------------------------------------------------------------

/**
 * Composes a system prompt string from a PromptConfig.
 *
 * Applies the toolPolicy to determine whether/how tools appear in the prompt:
 * - 'omit': no tool section, regardless of tools array content
 * - 'native': no tool section (tools provided via provider API, not prompt text)
 * - 'text-listed': includes "Available Tools" section when tools are non-empty
 *
 * @param config - The resolved PromptConfig
 * @param tools - Optional array of tool definitions
 * @returns Complete system prompt string
 */
export function composeSystemPromptFromConfig(
  config: PromptConfig,
  tools?: ToolDefinition[],
): string {
  const parts: string[] = [];

  // Identity block
  parts.push(config.identity);

  // Task frame
  parts.push(config.taskFrame);

  // Tool section (only for 'text-listed' with non-empty tools)
  if (
    config.toolPolicy === 'text-listed' &&
    tools != null &&
    tools.length > 0
  ) {
    parts.push(
      `Available Tools:\n${tools.map((tool) => `- ${tool.name}`).join('\n')}`,
    );
  }

  // Guardrails
  if (config.guardrails.length > 0) {
    parts.push(
      `Rules:\n${config.guardrails.map((rule) => `- ${rule}`).join('\n')}`,
    );
  }

  return parts.join('\n\n');
}
