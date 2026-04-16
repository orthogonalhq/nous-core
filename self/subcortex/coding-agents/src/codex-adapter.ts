/**
 * Codex SDK adapter — wraps the Codex SDK `Codex` class and wires Nous
 * governance hooks into the SDK's event stream.
 *
 * The Codex SDK uses a thread/turn model with streaming events rather than
 * explicit hook callbacks. The adapter translates:
 *   - item.started (command_execution, mcp_tool_call) → onPreToolUse
 *   - item.completed (command_execution, mcp_tool_call) → onPostToolUse
 *   - All events → onMessage
 *   - Thread completion → onStop
 *
 * NOTE: Like the Claude adapter, this file dynamically imports the Codex SDK
 * at runtime (peerDependency marked optional).
 */

import type { CodingAgentTaskInput, CodingAgentTaskResult, AgentHooks } from './types.js';

// ---------------------------------------------------------------------------
// SDK types — re-declared locally to avoid compile-time dependency
// ---------------------------------------------------------------------------

/** Minimal subset of the Codex SDK ThreadItem. */
interface CodexThreadItem {
  id: string;
  type: string;
  command?: string;
  tool?: string;
  arguments?: unknown;
  aggregated_output?: string;
  result?: unknown;
  status?: string;
  [key: string]: unknown;
}

/** Minimal subset of the Codex SDK ThreadEvent. */
interface CodexThreadEvent {
  type: string;
  item?: CodexThreadItem;
  thread_id?: string;
  [key: string]: unknown;
}

/** Minimal Codex class interface. */
interface CodexInstance {
  startThread(options?: Record<string, unknown>): {
    runStreamed(input: string): Promise<{ events: AsyncGenerator<CodexThreadEvent> }>;
  };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * Run a coding agent task via the Codex SDK with governance hooks.
 *
 * Unlike the Claude SDK (which has explicit PreToolUse/PostToolUse hooks),
 * the Codex SDK emits streaming events. The adapter intercepts
 * `item.started` and `item.completed` events for tool-like items
 * (command_execution, mcp_tool_call) and maps them to the AgentHooks
 * interface — proving the same governance hooks work for both SDKs.
 */
export async function runCodexAgent(
  task: CodingAgentTaskInput,
  hooks: AgentHooks,
): Promise<CodingAgentTaskResult> {
  const sdk = await importCodexSdk();

  const codex: CodexInstance = new sdk.Codex();

  const thread = codex.startThread({
    model: task.model,
    workingDirectory: task.workingDirectory,
    approvalPolicy: 'never', // agent runs autonomously under Nous governance
  });

  const messages: unknown[] = [];
  let success = true;

  const streamed = await thread.runStreamed(task.prompt);

  for await (const event of streamed.events) {
    messages.push(event);

    // Stream every event to the MAO panel
    hooks.onMessage?.(event);

    // Map item lifecycle events to governance hooks
    if (event.type === 'item.started' && event.item) {
      await handleItemStarted(event.item, hooks);
    }

    if (event.type === 'item.completed' && event.item) {
      await handleItemCompleted(event.item, hooks);
    }

    // Detect errors
    if (event.type === 'error' || event.type === 'turn.failed') {
      success = false;
    }
  }

  // Fire stop hook when the agent run completes
  await hooks.onStop?.();

  const finalResponse = extractFinalResponse(messages);

  return { success, messages, finalResponse };
}

// ---------------------------------------------------------------------------
// Event → hook mapping
// ---------------------------------------------------------------------------

/**
 * When a tool-like item starts, fire onPreToolUse.
 *
 * The Codex SDK doesn't have a pre-execution hook that can cancel —
 * the adapter fires onPreToolUse for governance recording / projection.
 * Actual cancellation would require integration with the Codex approval
 * policy system (future work beyond this spike).
 */
async function handleItemStarted(
  item: CodexThreadItem,
  hooks: AgentHooks,
): Promise<void> {
  if (!hooks.onPreToolUse) return;

  if (item.type === 'command_execution') {
    await hooks.onPreToolUse('Bash', { command: item.command });
  } else if (item.type === 'mcp_tool_call') {
    await hooks.onPreToolUse(
      item.tool ?? 'unknown_mcp_tool',
      item.arguments,
    );
  }
}

/**
 * When a tool-like item completes, fire onPostToolUse.
 */
async function handleItemCompleted(
  item: CodexThreadItem,
  hooks: AgentHooks,
): Promise<void> {
  if (!hooks.onPostToolUse) return;

  if (item.type === 'command_execution') {
    await hooks.onPostToolUse('Bash', { command: item.command }, {
      output: item.aggregated_output,
      exitCode: (item as Record<string, unknown>).exit_code,
    });
  } else if (item.type === 'mcp_tool_call') {
    await hooks.onPostToolUse(
      item.tool ?? 'unknown_mcp_tool',
      item.arguments,
      item.result,
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractFinalResponse(messages: unknown[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const event = messages[i] as CodexThreadEvent;
    if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
      return (event.item as Record<string, unknown>).text as string | undefined;
    }
  }
  return undefined;
}

/**
 * Dynamic import of the Codex SDK. Returns the module namespace.
 * Throws a clear error if the SDK is not installed.
 */
async function importCodexSdk(): Promise<{ Codex: new (options?: Record<string, unknown>) => CodexInstance }> {
  try {
    return await import('@openai/codex-sdk' as string);
  } catch {
    throw new Error(
      '@openai/codex-sdk is not installed. ' +
      'Install it as a dependency to use the Codex coding agent adapter.',
    );
  }
}
