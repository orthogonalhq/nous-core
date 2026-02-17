/**
 * EchoTool — Simple tool that echoes the input message.
 *
 * Used for Phase 1.3 to validate tool execution flow.
 */
import { z } from 'zod';
import type { ToolDefinition, ToolResult } from '@nous/shared';

const EchoInputSchema = z.object({
  message: z.string(),
});

export class EchoTool {
  getDefinition(): ToolDefinition {
    return {
      name: 'echo',
      version: '1.0.0',
      description: 'Echoes the input message back',
      inputSchema: {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message'],
      },
      outputSchema: {
        type: 'object',
        properties: { echoed: { type: 'string' } },
      },
      capabilities: ['read'],
      permissionScope: 'none',
    };
  }

  async execute(params: unknown): Promise<ToolResult> {
    const start = Date.now();
    try {
      const parsed = EchoInputSchema.parse(params);
      return {
        success: true,
        output: { echoed: parsed.message },
        durationMs: Date.now() - start,
      };
    } catch (e) {
      return {
        success: false,
        output: null,
        error: (e as Error).message,
        durationMs: Date.now() - start,
      };
    }
  }
}
