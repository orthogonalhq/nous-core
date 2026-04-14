/**
 * Claude Agent SDK adapter — wraps the Claude Agent SDK `query()` function
 * and wires Nous governance hooks into the SDK's hook system.
 *
 * The adapter translates between:
 *   - SDK hooks (PreToolUse, PostToolUse, Stop) → AgentHooks callbacks
 *   - SDK streaming messages → AgentHooks.onMessage
 *   - Nous CodingAgentTaskInput → SDK query() parameters
 *
 * NOTE: This file imports the Claude Agent SDK at runtime. If the SDK is not
 * installed the adapter will throw at call time, not at import time (the SDK
 * is a peerDependency marked optional).
 */

import type { CodingAgentTaskInput, CodingAgentTaskResult, AgentHooks } from './types.js';

// ---------------------------------------------------------------------------
// SDK types — re-declared locally to avoid compile-time dependency on the
// peer package (the SDK may not be installed in all environments).
// ---------------------------------------------------------------------------

/** Minimal subset of the Claude Agent SDK `Options` type that we use. */
interface ClaudeSdkOptions {
  cwd?: string;
  maxTurns?: number;
  model?: string;
  allowedTools?: string[];
  hooks?: Record<string, Array<{ matcher?: string; hooks: Array<(...args: unknown[]) => Promise<unknown>> }>>;
  permissionMode?: string;
}

/** Minimal subset of the SDK message types we consume. */
interface SdkMessage {
  type: string;
  [key: string]: unknown;
}

/** Shape of the SDK query() return — an async iterable of messages. */
interface SdkQuery {
  [Symbol.asyncIterator](): AsyncIterator<SdkMessage>;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * Run a coding agent task via the Claude Agent SDK with governance hooks.
 *
 * This function:
 *   1. Dynamically imports `@anthropic-ai/claude-agent-sdk`
 *   2. Translates AgentHooks into SDK hook callbacks
 *   3. Streams messages and collects results
 *   4. Returns a CodingAgentTaskResult
 */
export async function runClaudeAgent(
  task: CodingAgentTaskInput,
  hooks: AgentHooks,
): Promise<CodingAgentTaskResult> {
  // Dynamic import — avoids hard compile-time dependency on the peer package.
  const sdk = await importClaudeSdk();

  const sdkOptions: ClaudeSdkOptions = {
    cwd: task.workingDirectory,
    maxTurns: task.maxTurns,
    model: task.model,
    allowedTools: task.allowedTools,
    permissionMode: 'bypassPermissions',
  };

  // Wire governance hooks into SDK hook callbacks
  sdkOptions.hooks = buildSdkHooks(hooks);

  const messages: unknown[] = [];

  const queryResult: SdkQuery = sdk.query({
    prompt: task.prompt,
    options: sdkOptions,
  });

  let success = true;

  for await (const message of queryResult) {
    messages.push(message);

    // Stream every message to the MAO panel via onMessage
    hooks.onMessage?.(message);

    // Detect result messages for success/failure
    if (message.type === 'result') {
      success = !(message as Record<string, unknown>).is_error;
    }
  }

  // Fire stop hook when the agent run completes
  await hooks.onStop?.();

  const finalResponse = extractFinalResponse(messages);

  return { success, messages, finalResponse };
}

// ---------------------------------------------------------------------------
// SDK hook wiring
// ---------------------------------------------------------------------------

/**
 * Translates AgentHooks into Claude Agent SDK hook callback format.
 *
 * SDK hooks use the shape:
 * ```
 * { PreToolUse: [{ hooks: [async (input, toolUseID, opts) => output] }] }
 * ```
 *
 * We map:
 *   PreToolUse  → hooks.onPreToolUse  (returns permissionDecision)
 *   PostToolUse → hooks.onPostToolUse (returns empty output)
 *   Stop        → hooks.onStop        (returns empty output)
 */
function buildSdkHooks(
  hooks: AgentHooks,
): ClaudeSdkOptions['hooks'] {
  const sdkHooks: NonNullable<ClaudeSdkOptions['hooks']> = {};

  if (hooks.onPreToolUse) {
    sdkHooks['PreToolUse'] = [
      {
        hooks: [
          async (input: unknown) => {
            const hookInput = input as { tool_name: string; tool_input: unknown };
            const decision = await hooks.onPreToolUse!(
              hookInput.tool_name,
              hookInput.tool_input,
            );
            return {
              hookEventName: 'PreToolUse',
              permissionDecision: decision, // 'allow' | 'deny'
            };
          },
        ],
      },
    ];
  }

  if (hooks.onPostToolUse) {
    sdkHooks['PostToolUse'] = [
      {
        hooks: [
          async (input: unknown) => {
            const hookInput = input as {
              tool_name: string;
              tool_input: unknown;
              tool_response: unknown;
            };
            await hooks.onPostToolUse!(
              hookInput.tool_name,
              hookInput.tool_input,
              hookInput.tool_response,
            );
            return { hookEventName: 'PostToolUse' };
          },
        ],
      },
    ];
  }

  return sdkHooks;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractFinalResponse(messages: unknown[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as Record<string, unknown>;
    if (msg.type === 'result' && typeof msg.result === 'string') {
      return msg.result;
    }
  }
  return undefined;
}

/**
 * Dynamic import of the Claude Agent SDK. Returns the module namespace.
 * Throws a clear error if the SDK is not installed.
 */
async function importClaudeSdk(): Promise<{ query: (params: { prompt: string; options?: ClaudeSdkOptions }) => SdkQuery }> {
  try {
    return await import('@anthropic-ai/claude-agent-sdk' as string);
  } catch {
    throw new Error(
      '@anthropic-ai/claude-agent-sdk is not installed. ' +
      'Install it as a dependency to use the Claude coding agent adapter.',
    );
  }
}
