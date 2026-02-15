/**
 * Scheduler domain types for Nous-OSS.
 *
 * Supports the IScheduler interface.
 */
import { z } from 'zod';
import { ProjectIdSchema } from './ids.js';

// --- Schedule Definition ---
export const ScheduleDefinitionSchema = z.object({
  id: z.string(),
  projectId: ProjectIdSchema,
  cron: z.string().optional(),
  intervalMs: z.number().positive().optional(),
  taskRef: z.string(),
  enabled: z.boolean(),
  createdAt: z.string().datetime(),
});
export type ScheduleDefinition = z.infer<typeof ScheduleDefinitionSchema>;
