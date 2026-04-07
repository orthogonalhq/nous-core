/**
 * Canonical input schemas for text model providers.
 *
 * Validated at provider boundary.
 */
import { z } from 'zod';

const ToolInputSchema = z.object({
  name: z.string(),
  description: z.string(),
  input_schema: z.record(z.unknown()),
});

export const TextModelInputSchema = z.union([
  z.object({
    prompt: z.string(),
    tools: z.array(ToolInputSchema).optional(),
    systemSegments: z.array(z.string()).optional(),
  }),
  z.object({
    messages: z.array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string(),
      }),
    ),
    tools: z.array(ToolInputSchema).optional(),
    systemSegments: z.array(z.string()).optional(),
  }),
]);
export type TextModelInput = z.infer<typeof TextModelInputSchema>;
