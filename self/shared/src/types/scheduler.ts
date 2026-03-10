/**
 * Scheduler domain types for Nous-OSS.
 *
 * Supports the IScheduler interface.
 */
import { z } from 'zod';
import { IngressDeliveryModeSchema } from './ingress-trigger.js';
import { ProjectIdSchema, WorkflowDefinitionIdSchema } from './ids.js';
import { WorkmodeIdSchema } from './workmode.js';

export const ScheduleTriggerSpecSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('cron'),
    cron: z.string().min(1),
    timezone: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal('calendar'),
    execute_at: z.string().datetime(),
  }),
  z.object({
    kind: z.literal('hook'),
    event_name: z.string().min(1),
    source_filter: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal('system_event'),
    event_name: z.string().min(1),
  }),
]);
export type ScheduleTriggerSpec = z.infer<typeof ScheduleTriggerSpecSchema>;

export const ScheduleDefinitionSchema = z.object({
  id: z.string().uuid(),
  projectId: ProjectIdSchema,
  workflowDefinitionId: WorkflowDefinitionIdSchema,
  workmodeId: WorkmodeIdSchema,
  trigger: ScheduleTriggerSpecSchema,
  enabled: z.boolean(),
  requestedDeliveryMode: IngressDeliveryModeSchema.default('none'),
  payloadTemplateRef: z.string().min(1).optional(),
  nextDueAt: z.string().datetime().nullable().optional(),
  lastDispatchedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ScheduleDefinition = z.infer<typeof ScheduleDefinitionSchema>;

export const ScheduleUpsertInputSchema = z.object({
  id: z.string().uuid().optional(),
  projectId: ProjectIdSchema,
  workflowDefinitionId: WorkflowDefinitionIdSchema.optional(),
  workmodeId: WorkmodeIdSchema.optional(),
  trigger: ScheduleTriggerSpecSchema,
  enabled: z.boolean().default(true),
  requestedDeliveryMode: IngressDeliveryModeSchema.default('none'),
  payloadTemplateRef: z.string().min(1).optional(),
});
export type ScheduleUpsertInput = z.infer<typeof ScheduleUpsertInputSchema>;
