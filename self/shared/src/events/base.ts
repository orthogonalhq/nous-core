/**
 * Base event schema for Nous-OSS inter-layer communication.
 *
 * All events share this base structure. Domain events extend it.
 */
import { z } from 'zod';
import { TraceIdSchema, ProjectIdSchema } from '../types/ids.js';

export const BaseEventSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  traceId: TraceIdSchema.optional(),
  projectId: ProjectIdSchema.optional(),
});
export type BaseEvent = z.infer<typeof BaseEventSchema>;
