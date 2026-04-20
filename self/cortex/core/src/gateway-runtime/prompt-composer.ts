import type { PromptFormatterInput, PromptFormatterOutput, ToolDefinition } from '@nous/shared';
import type { AgentProfile } from './prompt-strategy.js';
import type { AdapterCapabilities } from '../agent-gateway/adapters/types.js';

/**
 * Composes a system prompt and tool definitions from an agent profile.
 *
 * Agent-type axis composition: identity + taskFrame + guardrails + tools + execution context.
 * Provider axis is handled separately by the adapter's formatRequest().
 *
 * When the adapter supports native tool-use, toolDefinitions are returned for the API body.
 * When it does not, tools are listed as text names in the prompt (current behavior).
 */
export function composeFromProfile(
  profile: AgentProfile,
  adapterCapabilities: AdapterCapabilities,
  input: PromptFormatterInput,
): PromptFormatterOutput {
  const parts: string[] = [];

  // Identity block (may have personality overrides from resolveAgentProfile)
  parts.push(profile.identity);

  // Task frame
  parts.push(profile.taskFrame);

  // Base system prompt override (if provided by caller)
  if (input.baseSystemPrompt?.trim()) {
    parts.push(input.baseSystemPrompt.trim());
  }

  // Execution context
  const execLines: string[] = [];
  if (input.execution?.projectId) {
    execLines.push(`project_id: ${input.execution.projectId}`);
  }
  if (input.execution?.executionId) {
    execLines.push(`execution_id: ${input.execution.executionId}`);
  }
  if (input.execution?.nodeDefinitionId) {
    execLines.push(`node_definition_id: ${input.execution.nodeDefinitionId}`);
  }
  if (input.execution?.workmodeId) {
    execLines.push(`workmode_id: ${input.execution.workmodeId}`);
  }
  if (execLines.length > 0) {
    parts.push(`Execution Context:\n${execLines.join('\n')}`);
  }

  // Tool handling based on policy and adapter capabilities
  let toolDefinitions: ToolDefinition[] | undefined;

  if (profile.toolPolicy === 'native' || adapterCapabilities.nativeToolUse) {
    // Tools go in API body — return them as toolDefinitions
    toolDefinitions = input.tools && input.tools.length > 0 ? input.tools : undefined;
  } else if (profile.toolPolicy === 'text-listed' && input.tools && input.tools.length > 0) {
    // Tools listed as text names in prompt (current behavior)
    parts.push(
      `Available Tools:\n${input.tools.map((tool) => `- ${tool.name}`).join('\n')}`,
    );
    toolDefinitions = undefined;
  } else {
    // 'omit' or no tools
    toolDefinitions = undefined;
  }

  // Guardrails
  if (profile.guardrails.length > 0) {
    parts.push(
      `Rules:\n${profile.guardrails.map((rule) => `- ${rule}`).join('\n')}`,
    );
  }

  // Task instructions — emitted last so domain-specific instructions land
  // in the recency-favored attention position (after identity, taskFrame,
  // execution context, tools, and guardrails).
  parts.push(`Task Instructions:\n${input.taskInstructions}`);

  const systemPrompt = parts.join('\n\n');

  return { systemPrompt, toolDefinitions };
}
