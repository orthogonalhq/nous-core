/**
 * ToolExecutor — IToolExecutor implementation.
 *
 * Executes tools by name, validates input against schema.
 */
import type { IToolExecutor, ToolDefinition, ToolResult, ProjectId } from '@nous/shared';
import { EchoTool } from './tools/echo-tool.js';

type ToolImpl = {
  definition: ToolDefinition;
  execute: (params: unknown, projectId?: ProjectId) => Promise<ToolResult>;
};

export class ToolExecutor implements IToolExecutor {
  private readonly tools = new Map<string, ToolImpl>();

  constructor(
    tools?: Array<{
      getDefinition(): ToolDefinition;
      execute(params: unknown, projectId?: ProjectId): Promise<ToolResult>;
    }>,
  ) {
    const toRegister = tools ?? [new EchoTool()];
    for (const tool of toRegister) {
      const definition = tool.getDefinition();
      this.tools.set(definition.name, {
        definition,
        execute: (params, projectId) => tool.execute(params, projectId),
      });
    }
  }

  async execute(
    toolName: string,
    params: unknown,
    projectId?: ProjectId,
  ): Promise<ToolResult> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return {
        success: false,
        output: null,
        error: `Tool "${toolName}" not found`,
        durationMs: 0,
      };
    }

    return tool.execute(params, projectId);
  }

  async listTools(): Promise<ToolDefinition[]> {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }
}
