/**
 * SDK-agnostic types for coding agent integration.
 *
 * These types decouple the Nous governance surface from any specific SDK.
 * Both the Claude Agent SDK adapter and the Codex SDK adapter implement
 * the same AgentHooks interface — proving the pattern works across vendors.
 */

// ---------------------------------------------------------------------------
// Task input — what the workflow engine passes to a coding agent node
// ---------------------------------------------------------------------------

export interface CodingAgentTaskInput {
  /** The natural-language prompt / instruction for the agent. */
  prompt: string;
  /** Tool names the agent is permitted to use (SDK-level allowlist). */
  allowedTools?: string[];
  /** Filesystem root the agent operates within. */
  workingDirectory?: string;
  /** Maximum number of agent turns before the adapter forces a stop. */
  maxTurns?: number;
  /** Model identifier override (e.g. 'claude-sonnet-4-6', 'o3'). */
  model?: string;
}

// ---------------------------------------------------------------------------
// Task result — what an adapter returns after the agent run completes
// ---------------------------------------------------------------------------

export interface CodingAgentTaskResult {
  /** Whether the agent run completed without errors. */
  success: boolean;
  /** Opaque message history collected during the run. */
  messages: unknown[];
  /** Optional final text response from the agent. */
  finalResponse?: string;
}

// ---------------------------------------------------------------------------
// Governance hooks — the SDK-agnostic interface that adapters consume
// ---------------------------------------------------------------------------

/**
 * AgentHooks is the single governance surface that every SDK adapter must
 * wire into its respective hook/event system.
 *
 * The interface maps directly to the Nous governance primitives:
 *   onPreToolUse  → PFC governance gate  (allow / deny)
 *   onPostToolUse → Witness chain        (record every action)
 *   onStop        → MAO control surface  (pause / hard-stop)
 *   onMessage     → MAO panel streaming  (real-time activity)
 */
export interface AgentHooks {
  /**
   * Called before a tool executes. The governance layer (PFC) decides
   * whether to allow or deny the tool call.
   */
  onPreToolUse?: (
    toolName: string,
    input: unknown,
  ) => Promise<'allow' | 'deny'>;

  /**
   * Called after a tool executes. The governance layer (witness chain)
   * records evidence of the action.
   */
  onPostToolUse?: (
    toolName: string,
    input: unknown,
    output: unknown,
  ) => Promise<void>;

  /**
   * Called when the agent session stops. The governance layer (MAO)
   * can record the stop event.
   */
  onStop?: () => Promise<void>;

  /**
   * Called for every streaming message / event from the agent. The
   * governance layer (MAO panel) renders real-time activity.
   */
  onMessage?: (message: unknown) => void;
}

// ---------------------------------------------------------------------------
// MAO event envelope — emitted by governance hooks for the MAO panel
// ---------------------------------------------------------------------------

export interface MaoAgentEvent {
  type:
    | 'tool_use_requested'
    | 'tool_use_allowed'
    | 'tool_use_denied'
    | 'tool_use_completed'
    | 'agent_message'
    | 'agent_stopped';
  toolName?: string;
  data: unknown;
  timestamp: string;
}
