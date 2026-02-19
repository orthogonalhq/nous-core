/**
 * ToolExecutor — IToolExecutor implementation.
 *
 * Executes tools by name, validates input against schema.
 */
import type { IToolExecutor, ToolDefinition, ToolResult, ProjectId } from '@nous/shared';
import { EchoTool } from './tools/echo-tool.js';

type ToolImpl = {
  definition: ToolDefinition;
  execute: (params: unknown) => Promise<ToolResult>;
};

export class ToolExecutor implements IToolExecutor {
  private readonly tools = new Map<string, ToolImpl>();

  constructor(tools?: ToolDefinition[]) {
    const toRegister = tools ?? [new EchoTool().getDefinition()];
    for (const def of toRegister) {
      const impl = this.toolFromDefinition(def);
      if (impl) {
        this.tools.set(def.name, impl);
      }
    }
  }

  async execute(
    toolName: string,
    params: unknown,
    _projectId?: ProjectId,
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

    return tool.execute(params);
  }

  async listTools(): Promise<ToolDefinition[]> {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  private toolFromDefinition(def: ToolDefinition): ToolImpl | null {
    if (def.name === 'echo') {
      const echo = new EchoTool();
      return {
        definition: echo.getDefinition(),
        execute: (p) => echo.execute(p),
      };
    }
    return null;
  }
}
