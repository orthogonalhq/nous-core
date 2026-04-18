/**
 * Canonical input schemas for text model providers.
 *
 * Validated at provider boundary.
 */
import { z } from 'zod';

// Legacy tool format: { name, description, input_schema }
const LegacyToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  input_schema: z.record(z.unknown()),
});

// Adapter-formatted tool: { type: 'function', function: { name, description, parameters } }
const AdapterToolSchema = z.object({
  type: z.literal('function'),
  function: z.object({
    name: z.string(),
    description: z.string(),
    parameters: z.record(z.unknown()),
  }),
});

const ToolInputSchema = z.union([LegacyToolSchema, AdapterToolSchema]);

// Anthropic content blocks: [{ type: 'tool_result', tool_use_id, content }]
const ContentBlockSchema = z.object({
  type: z.string(),
  tool_use_id: z.string().optional(),
  content: z.string().optional(),
  text: z.string().optional(),
}).passthrough();

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.union([z.string(), z.array(ContentBlockSchema)]),
  tool_call_id: z.string().optional(),
  tool_calls: z.array(z.object({
    id: z.string(),
    type: z.literal('function'),
    function: z.object({
      name: z.string(),
      arguments: z.union([z.string(), z.record(z.unknown())]),
    }),
  })).optional(),
});

export const TextModelInputSchema = z.union([
  z.object({
    prompt: z.string(),
    tools: z.array(ToolInputSchema).optional(),
    systemSegments: z.array(z.string()).optional(),
  }),
  z.object({
    messages: z.array(MessageSchema),
    tools: z.array(ToolInputSchema).optional(),
    system: z.union([z.string(), z.array(z.unknown())]).optional(),
    systemSegments: z.array(z.string()).optional(),
    stream: z.boolean().optional(),
  }),
]);
export type TextModelInput = z.infer<typeof TextModelInputSchema>;
