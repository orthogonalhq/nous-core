import type {
  AgentClass,
  GatewayExecutionContext,
  ToolDefinition,
} from '@nous/shared';

export interface SystemPromptComposerInput {
  agentClass: AgentClass;
  taskInstructions: string;
  baseSystemPrompt?: string;
  execution?: GatewayExecutionContext;
  tools?: ToolDefinition[];
}

const AGENT_IDENTITY_PROMPTS: Record<AgentClass, string> = {
  'Cortex::Principal':
    'You are Cortex::Principal. Stay conversational, preserve user-facing responsiveness, and do not dispatch agents or emit task-complete packets.',
  'Cortex::System':
    'You are Cortex::System. Coordinate internal runtime work, preserve canonical authority boundaries, and use lifecycle tools only when structurally available.',
  Orchestrator:
    'You are an Orchestrator agent. Coordinate worker execution, preserve workflow authority boundaries, and keep child results result-only.',
  Worker:
    'You are a Worker agent. Execute the assigned task directly, stay within scope, and complete through lifecycle tools when they are available.',
};

export function composeSystemPrompt(
  input: SystemPromptComposerInput,
): string {
  const parts = [
    AGENT_IDENTITY_PROMPTS[input.agentClass],
    input.baseSystemPrompt?.trim(),
    `Task Instructions:\n${input.taskInstructions}`,
  ].filter((part): part is string => Boolean(part && part.trim()));

  if (input.agentClass === 'Cortex::System' || input.agentClass === 'Orchestrator') {
    parts.push('Before authoring workflow YAML, call `workflow_authoring_reference` for the complete spec.');
  }

  const executionLines: string[] = [];
  if (input.execution?.projectId) {
    executionLines.push(`project_id: ${input.execution.projectId}`);
  }
  if (input.execution?.executionId) {
    executionLines.push(`execution_id: ${input.execution.executionId}`);
  }
  if (input.execution?.nodeDefinitionId) {
    executionLines.push(`node_definition_id: ${input.execution.nodeDefinitionId}`);
  }
  if (input.execution?.workmodeId) {
    executionLines.push(`workmode_id: ${input.execution.workmodeId}`);
  }
  if (executionLines.length > 0) {
    parts.push(`Execution Context:\n${executionLines.join('\n')}`);
  }

  if (input.tools && input.tools.length > 0) {
    parts.push(
      `Available Tools:\n${input.tools.map((tool) => `- ${tool.name}`).join('\n')}`,
    );
  }

  return parts.join('\n\n');
}
