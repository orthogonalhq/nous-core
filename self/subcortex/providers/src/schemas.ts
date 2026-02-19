/**
 * Canonical input schemas for text model providers.
 *
 * Validated at provider boundary.
 */
import { z } from 'zod';

export const TextModelInputSchema = z.union([
  z.object({ prompt: z.string() }),
  z.object({
    messages: z.array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string(),
      }),
    ),
  }),
]);
export type TextModelInput = z.infer<typeof TextModelInputSchema>;
