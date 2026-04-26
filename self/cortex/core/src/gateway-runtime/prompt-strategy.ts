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

// SP 1.9 Item 2 — structural mirror of `@nous/autonomic-config` `UserProfile`
// (schema.ts:201-206 — `displayName`, `role`, `primaryUseCase` strings;
// `expertise` enum). Mirrored locally so `@nous/cortex-core` stays decoupled
// from `@nous/autonomic-config` (no new package edge). Schema is BINDING-frozen
// for SP 1.9 (SDS I2 / Goals Constraint 4) so structural drift is not a risk.
// If the schema gains a field in a future sub-phase, this mirror updates with
// it — drift is caught at the Principal-runtime call site (cortex-runtime.ts
// lines 339, 1128) where `IConfig.getUserProfile()` is read and passed in.
export interface UserProfile {
  readonly displayName?: string;
  readonly role?: string;
  readonly primaryUseCase?: string;
  readonly expertise?: 'beginner' | 'intermediate' | 'advanced';
}

// ---------------------------------------------------------------------------
// SP 1.9 Item 2 — agent identity projection
// ---------------------------------------------------------------------------

/** SP 1.9 Item 2 — default agent name surfaced in identity composition. */
export const DEFAULT_AGENT_NAME = 'Nous';

/**
 * SP 1.9 Item 2 — projection passed to `resolveAgentProfile` /
 * `applyPersonalityToIdentity` carrying the user-configured agent name and
 * the user-profile fragments to weave into the Principal identity block.
 *
 * Per SDS § 0 Note 2 / Invariant C, only `Cortex::Principal` consumes this
 * projection — non-Principal classes ignore it (gated inside
 * `applyPersonalityToIdentity`).
 */
export interface AgentIdentityProjection {
  readonly name?: string;
  readonly userProfile?: UserProfile;
}

/**
 * SP 1.9 Item 2 — sanitization pipeline for free-text identity fragments.
 *
 * Pipeline order (binding — Invariant F / SDS § 0 Note 3):
 *   1. strip newlines (\\r and \\n -> single space)
 *   2. strip `<|...|>` AND `<|...` (open-only) chat-template markers via the
 *      SDS-specified pattern `/<\|[^|]*(\|>|$)/g` — the `|$` alternation
 *      covers the open-only variant where the marker has no closing `|>`
 *   3. collapse repeated whitespace into single spaces
 *   4. trim leading/trailing whitespace
 *   5. length-cap with ellipsis at the per-field maxLength (caller passes)
 *   6. escape inner double-quotes (so the caller can safely wrap in `"..."`)
 *
 * Module-private — not exported. Unit-tested in `prompt-strategy.test.ts`
 * (Axis A, Task #16 case 6). All four free-text fields rendered into the
 * identity block (`agent.name`, `userProfile.displayName`, `userProfile.role`,
 * `userProfile.primaryUseCase`) flow through this single helper — Invariant F.
 *
 * Per-field caps (SDS § 0 Note 3 step 5 — passed by call sites):
 *   - `agent.name`              → 120
 *   - `userProfile.displayName` → 120
 *   - `userProfile.role`        → 120
 *   - `userProfile.primaryUseCase` → 500
 */
function sanitizeForIdentityFragment(input: string, maxLength: number): string {
  let s = input.replace(/[\r\n]+/g, ' ');
  // SDS § 0 Note 3 step 2 — covers both closed (`<|...|>`) and open-only
  // (`<|...` without trailing `|>`) chat-format markers via the `|$`
  // alternation. Pattern matches the SDS-specified regex verbatim.
  s = s.replace(/<\|[^|]*(\|>|$)/g, '');
  s = s.replace(/\s+/g, ' ');
  s = s.trim();
  if (s.length > maxLength) {
    s = s.slice(0, maxLength - 1) + '…';
  }
  s = s.replace(/"/g, '\\"');
  return s;
}

// SDS § 0 Note 3 step 5 — per-field length caps. Surfaced as named
// constants so each call site is self-documenting and a future schema-cap
// change updates one place.
const SANITIZE_MAX_AGENT_NAME = 120;
const SANITIZE_MAX_DISPLAY_NAME = 120;
const SANITIZE_MAX_ROLE = 120;
const SANITIZE_MAX_PRIMARY_USE_CASE = 500;

/**
 * SP 1.9 Item 2 — register-directive fragment for the user's `expertise`
 * level. Exhaustive switch over the three enum branches; no `default` so
 * a future enum-widening fails type-check.
 */
function expertiseFragment(
  expertise: NonNullable<UserProfile['expertise']>,
): string {
  // SDS § 0 Note 4 — verbatim register-directive prose per enum value.
  switch (expertise) {
    case 'beginner':
      return "When explaining concepts relevant to the user's work, favor accessible language and ground abstractions in concrete examples; avoid jargon unless you also define it.";
    case 'intermediate':
      return 'When explaining concepts, use domain-appropriate vocabulary; you may skip foundational definitions unless the user asks.';
    case 'advanced':
      return "When explaining concepts, speak at a technical peer's register; be concise with foundational material and go deeper on nuance.";
    default: {
      const _exhaustive: never = expertise;
      throw new Error(
        `expertiseFragment: unhandled expertise value "${_exhaustive as string}"`,
      );
    }
  }
}

/**
 * SP 1.9 Item 2 — assemble the Principal identity-block fragments from a
 * projection. Composition order is BINDING (per SDS § Data Model § Composition
 * order, Q-SDS-Item2-2):
 *
 *   1. agent-name (gated on `name != null && name !== DEFAULT_AGENT_NAME`)
 *   2. userProfile.displayName
 *   3. userProfile.role
 *   4. userProfile.expertise (register directive)
 *   5. userProfile.primaryUseCase
 *
 * Each free-text field passes through `sanitizeForIdentityFragment`
 * (Invariant F). Empty / undefined projection produces an empty array
 * (Goals C14 — empty-profile fall-through preserved).
 */
function buildPrincipalIdentityFragments(
  projection: AgentIdentityProjection | undefined,
): readonly string[] {
  if (projection == null) return [];
  const fragments: string[] = [];

  if (projection.name != null && projection.name !== DEFAULT_AGENT_NAME) {
    const name = sanitizeForIdentityFragment(projection.name, SANITIZE_MAX_AGENT_NAME);
    if (name.length > 0) {
      // SDS § 0 Note 2 fragment-template (verbatim) — agentNameFragment.
      fragments.push(
        `Your name is "${name}". When asked your name or who you are, introduce yourself as "${name}".`,
      );
    }
  }

  const profile = projection.userProfile;
  if (profile != null) {
    if (profile.displayName != null) {
      const v = sanitizeForIdentityFragment(profile.displayName, SANITIZE_MAX_DISPLAY_NAME);
      if (v.length > 0) {
        // SDS § 0 Note 2 fragment-template (verbatim) — userDisplayNameFragment.
        fragments.push(`You are speaking with "${v}".`);
      }
    }
    if (profile.role != null) {
      const v = sanitizeForIdentityFragment(profile.role, SANITIZE_MAX_ROLE);
      if (v.length > 0) {
        // SDS § 0 Note 2 fragment-template (verbatim) — userRoleFragment.
        fragments.push(`The user's role is described as "${v}".`);
      }
    }
    if (profile.expertise != null) {
      fragments.push(expertiseFragment(profile.expertise));
    }
    if (profile.primaryUseCase != null) {
      const v = sanitizeForIdentityFragment(profile.primaryUseCase, SANITIZE_MAX_PRIMARY_USE_CASE);
      if (v.length > 0) {
        // SDS § 0 Note 2 fragment-template (verbatim) — userPrimaryUseCaseFragment.
        fragments.push(`The user is primarily working on: "${v}".`);
      }
    }
  }

  return fragments;
}

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
    'Acknowledge the request naturally and let them know you\'re on it. ' +
    // SP 1.9 Fix #2 — identity anchor (≤180 chars budget per SDS § 0 Note 5).
    'Do not describe yourself as a generic large language model and do not name the underlying model provider. ' +
    'When asked who you are, answer in the first person as yourself, not as any model.',
  taskFrame:
    'Have a natural conversation with the user. Answer their questions directly. ' +
    'If they ask for work that requires execution, use your tools to handle it. ' +
    'Most of your interactions will be conversational — treat delegation as the exception, not the default.',
  toolPolicy: 'native',
  guardrails: [
    'Never mention agent classes, dispatch chains, gateways, orchestrators, workers, or runtime internals.',
    'Never produce raw JSON envelopes in your responses to the user. Card XML tags (e.g. <StatusCard ... />) and tool calls are exceptions — use them as instructed.',
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
  agentIdentityProjection?: AgentIdentityProjection,
): AgentProfile {
  const promptConfig = resolvePromptConfig(agentClass, providerId);
  const dimensions = DIMENSIONS_BY_CLASS[agentClass];

  // Personality application: affects identity and outputContract only.
  // guardrails and mechanical dimensions are never personality-affected.
  // SP 1.9 Item 2 — when a projection is supplied, identity composition runs
  // even if `personalityConfig` is null (so the projection fragments still
  // surface). The dimension-isolation gate inside `applyPersonalityToIdentity`
  // (Invariant C) restricts projection-fragment emission to
  // `Cortex::Principal` so non-Principal classes remain byte-identical.
  const composeIdentity =
    personalityConfig != null || agentIdentityProjection != null;
  const identity = composeIdentity
    ? applyPersonalityToIdentity(
        agentClass,
        promptConfig.identity,
        personalityConfig ?? { preset: 'balanced' },
        agentIdentityProjection,
      )
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
  agentClass: AgentClass,
  baseIdentity: string,
  personalityConfig: PersonalityConfig,
  agentIdentityProjection?: AgentIdentityProjection,
): string {
  const axes = resolvePersonality(personalityConfig);
  const fragments = collectFragmentsByTarget(axes);
  const personalityFragments = [...fragments.identity, ...fragments.outputContract];

  // SP 1.9 Invariant C — dimension-isolation gate. UserProfile-and-agent-name
  // fragment emission is restricted to `Cortex::Principal` only. Non-Principal
  // classes (System / Orchestrator / Worker) see personality fragments but
  // NOT projection fragments — regardless of whether the caller passed a
  // non-empty projection. This is the auditable single-place enforcement.
  if (agentClass !== 'Cortex::Principal') {
    if (personalityFragments.length === 0) return baseIdentity;
    return [baseIdentity, ...personalityFragments].join('\n\n');
  }

  const identityFragments = buildPrincipalIdentityFragments(agentIdentityProjection);
  const allFragments = [...identityFragments, ...personalityFragments];
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
