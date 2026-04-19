/**
 * Prompt Strategy Pattern — per-agent-class prompt resolution.
 *
 * Maps (agentClass, providerId?) to a PromptConfig containing identity,
 * task frame, tool policy, and guardrails. Pure functions, no side effects.
 *
 * Sub-phase 1.1 of WR-124 (Chat Response Quality).
 */
import type { AgentClass, ToolConcurrencyConfig, ToolDefinition } from '@nous/shared';
import type { PersonalityConfig } from './personality/index.js';
import { collectFragmentsByTarget, resolvePersonality } from './personality/index.js';

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

  /**
   * User-configured personality input (WR-128).
   * Affects identity wording and prose output style only.
   * Concrete type landed in SP 1.2 — see ./personality/index.js.
   */
  readonly personalityConfig?: PersonalityConfig;
}

// ── Agent Profile types (WR-127) ─────────────────────────────────────

/** Context budget defaults for an agent class */
export interface ContextBudgetDefaults {
  /** Maximum context tokens before compaction triggers */
  readonly maxContextTokens?: number;
  /** Compaction threshold as ratio of context window (0-1) */
  readonly compactionThreshold?: number;
  /** Default turn budget */
  readonly maxTurns?: number;
}

/** Loop behavior variants */
export type LoopShape = 'single-turn' | 'multi-turn' | 'delegating';

// Re-export ToolConcurrencyConfig from @nous/shared for backward compatibility
export type { ToolConcurrencyConfig } from '@nous/shared';

/** Escalation configuration */
export interface EscalationConfig {
  /** Whether this agent class can escalate */
  readonly canEscalate: boolean;
  /** Auto-escalate after N consecutive failures */
  readonly autoEscalateAfterFailures?: number;
}

/** Output shape contract */
export type OutputContract = 'prose' | 'structured' | 'mixed';

/**
 * Full behavioral profile for an agent class.
 * Extends PromptConfig with operational/mechanical dimensions.
 * Immutable after construction — all fields readonly.
 */
export interface AgentProfile extends PromptConfig {
  /** Per-class context budget defaults */
  readonly contextBudget?: ContextBudgetDefaults;
  /** Compaction strategy identifier */
  readonly compactionStrategy?: string;
  /** How the gateway loop behaves for this agent class */
  readonly loopShape?: LoopShape;
  /** Tool execution concurrency model */
  readonly toolConcurrency?: ToolConcurrencyConfig;
  /** When/how this agent class escalates */
  readonly escalationRules?: EscalationConfig;
  /** Expected output shape */
  readonly outputContract?: OutputContract;
}

// ---------------------------------------------------------------------------
// Default configs (private — exposed only through resolvePromptConfig)
// ---------------------------------------------------------------------------

const PRINCIPAL_DEFAULT_CONFIG: PromptConfig = {
  identity:
    'You are the user\'s AI assistant. You are helpful, knowledgeable, and conversational. ' +
    'You answer questions, discuss ideas, help with planning, explain concepts, and engage naturally. ' +
    'You have a warm but direct communication style — clear without being verbose, ' +
    'friendly without being sycophantic. ' +
    'When the user asks you to do something that requires execution (running code, managing files, ' +
    'orchestrating workflows, creating content), use your tools to handle it. ' +
    'Acknowledge the request naturally and let them know you\'re on it.',
  taskFrame:
    'Have a natural conversation with the user. Answer their questions directly. ' +
    'If they ask for work that requires execution, use your tools to handle it. ' +
    'Most of your interactions will be conversational — treat delegation as the exception, not the default.',
  toolPolicy: 'native',
  guardrails: [
    'Never mention agent classes, dispatch chains, gateways, orchestrators, workers, or runtime internals.',
    'Never produce raw JSON envelopes or structured command output in your responses to the user.',
    'Never narrate your own reasoning process or expose chain-of-thought.',
    'If you don\'t know something, say so directly rather than deflecting to delegation.',
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

// ── Default agent profile dimensions (WR-127) ────────────────────────

interface AgentProfileDimensions {
  contextBudget: ContextBudgetDefaults;
  compactionStrategy?: string;
  loopShape: LoopShape;
  toolConcurrency?: ToolConcurrencyConfig;
  escalationRules: EscalationConfig;
  outputContract: OutputContract;
}

const PRINCIPAL_DIMENSIONS: AgentProfileDimensions = {
  contextBudget: { maxContextTokens: 128_000, compactionThreshold: 0.8, maxTurns: 6 },
  loopShape: 'multi-turn',
  escalationRules: { canEscalate: false },
  outputContract: 'prose',
};

const SYSTEM_DIMENSIONS: AgentProfileDimensions = {
  contextBudget: { maxContextTokens: 32_000, compactionThreshold: 0.7, maxTurns: 50 },
  loopShape: 'delegating',
  toolConcurrency: { maxConcurrent: 1 },
  escalationRules: { canEscalate: false },
  outputContract: 'mixed',
};

const ORCHESTRATOR_DIMENSIONS: AgentProfileDimensions = {
  contextBudget: { maxContextTokens: 32_000, compactionThreshold: 0.7, maxTurns: 30 },
  loopShape: 'delegating',
  toolConcurrency: { maxConcurrent: 1 },
  escalationRules: { canEscalate: true, autoEscalateAfterFailures: 3 },
  outputContract: 'mixed',
};

const WORKER_DIMENSIONS: AgentProfileDimensions = {
  contextBudget: { maxContextTokens: 16_000, compactionThreshold: 0.6, maxTurns: 10 },
  loopShape: 'multi-turn',
  toolConcurrency: { maxConcurrent: 1 },
  escalationRules: { canEscalate: true, autoEscalateAfterFailures: 2 },
  outputContract: 'structured',
};

const DIMENSIONS_BY_CLASS: Record<AgentClass, AgentProfileDimensions> = {
  'Cortex::Principal': PRINCIPAL_DIMENSIONS,
  'Cortex::System': SYSTEM_DIMENSIONS,
  Orchestrator: ORCHESTRATOR_DIMENSIONS,
  Worker: WORKER_DIMENSIONS,
};

// ── resolveAgentProfile ──────────────────────────────────────────────

/**
 * Resolves a full AgentProfile for the given agent class.
 * Extends resolvePromptConfig — returns all 4 prompt dimensions
 * plus 6 behavioral dimensions.
 *
 * @param agentClass - One of the four canonical agent classes
 * @param providerId - Optional provider for per-provider prompt overrides
 * @param personalityConfig - Optional user personality config (WR-128 / SP 1.2).
 * @returns Immutable AgentProfile
 */
export function resolveAgentProfile(
  agentClass: AgentClass,
  providerId?: string,
  personalityConfig?: PersonalityConfig,
): AgentProfile {
  const promptConfig = resolvePromptConfig(agentClass, providerId);
  const dimensions = DIMENSIONS_BY_CLASS[agentClass];

  // Personality application: affects identity and outputContract only.
  // guardrails and mechanical dimensions are never personality-affected.
  const identity = personalityConfig != null
    ? applyPersonalityToIdentity(promptConfig.identity, personalityConfig)
    : promptConfig.identity;
  const outputContract = personalityConfig != null
    ? applyPersonalityToOutputContract(dimensions.outputContract, personalityConfig)
    : dimensions.outputContract;

  return {
    identity,
    taskFrame: promptConfig.taskFrame,
    toolPolicy: promptConfig.toolPolicy,
    guardrails: promptConfig.guardrails,
    personalityConfig,
    contextBudget: dimensions.contextBudget,
    compactionStrategy: dimensions.compactionStrategy,
    loopShape: dimensions.loopShape,
    toolConcurrency: dimensions.toolConcurrency,
    escalationRules: dimensions.escalationRules,
    outputContract,
  };
}

/**
 * Apply personality overrides to the identity block (WR-128 / SP 1.2).
 *
 * Resolves the config into effective `TraitAxes`, collects fragment lists per
 * target via `collectFragmentsByTarget`, and concatenates all non-null
 * fragments onto `baseIdentity` in registry tuple order. Per SDS § 0 Note 1
 * Option (a) / ADR 017, both `identity`- and `outputContract`-targeted
 * fragments surface here; the enum-shaped `applyPersonalityToOutputContract`
 * below is a deliberate pass-through.
 *
 * `{ preset: 'balanced' }` yields zero fragments (all `standard`/`compliant`/
 * `concise` variants have `injection: null`) and the function returns
 * `baseIdentity` unchanged — SDS I2.
 */
function applyPersonalityToIdentity(
  baseIdentity: string,
  personalityConfig: PersonalityConfig,
): string {
  const axes = resolvePersonality(personalityConfig);
  const fragments = collectFragmentsByTarget(axes);
  const allFragments = [...fragments.identity, ...fragments.outputContract];
  if (allFragments.length === 0) return baseIdentity;
  return [baseIdentity, ...allFragments].join('\n\n');
}

/**
 * Apply personality overrides to the output contract (WR-128 / SP 1.2).
 *
 * Deliberate pass-through per SDS § 0 Note 1 Option (a) / ADR 017. The
 * `OutputContract` is a narrow enum (`'prose' | 'structured' | 'mixed'`)
 * surfaced to downstream consumers; no personality trait mutates the enum
 * value. `outputContract`-targeted fragment text is surfaced by
 * `applyPersonalityToIdentity` above.
 *
 * The body resolves the config and invokes `collectFragmentsByTarget` anyway
 * so the WR-127 isolation invariant is audit-visible at this function
 * boundary — a future drift where a well-meaning change starts mutating the
 * enum fails loudly rather than quietly.
 */
function applyPersonalityToOutputContract(
  baseContract: OutputContract,
  personalityConfig: PersonalityConfig,
): OutputContract {
  const axes = resolvePersonality(personalityConfig);
  collectFragmentsByTarget(axes); // intentional — audits the invariant
  return baseContract;
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
