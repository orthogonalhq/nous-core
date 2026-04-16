/**
 * Tool domain types for Nous-OSS.
 *
 * Supports the IToolExecutor interface.
 */
import { z } from 'zod';

// --- Tool Definition ---
// Declaration of a tool's capabilities and interface.
export const ToolDefinitionSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.record(z.unknown()),
  capabilities: z.array(z.string()),
  permissionScope: z.string(),
  execution: z
    .object({
      taskSupport: z.enum(['none', 'optional', 'required']).default('none'),
    })
    .strict()
    .optional(),
  isConcurrencySafe: z.boolean().optional(),
});
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

// --- Tool Result ---
// Result of a tool execution.
export const ToolResultSchema = z.object({
  success: z.boolean(),
  output: z.unknown(),
  error: z.string().optional(),
  durationMs: z.number().min(0),
});
export type ToolResult = z.infer<typeof ToolResultSchema>;
