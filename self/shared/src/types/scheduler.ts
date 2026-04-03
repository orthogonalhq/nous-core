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

export const ScheduleDefinitionBaseSchema = z.object({
  id: z.string().uuid(),
  projectId: ProjectIdSchema,
  workflowDefinitionId: WorkflowDefinitionIdSchema.optional(),
  taskDefinitionId: z.string().uuid().optional(),
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

export const ScheduleDefinitionSchema = ScheduleDefinitionBaseSchema.refine(
  (data) => {
    const hasWorkflow = data.workflowDefinitionId != null;
    const hasTask = data.taskDefinitionId != null;
    return (hasWorkflow || hasTask) && !(hasWorkflow && hasTask);
  },
  { message: 'Exactly one of workflowDefinitionId or taskDefinitionId must be present' },
);

// Type derived from base for composition compatibility (ZodEffects does not support .omit/.extend)
export type ScheduleDefinition = z.infer<typeof ScheduleDefinitionBaseSchema>;

export const ScheduleUpsertInputSchema = z.object({
  id: z.string().uuid().optional(),
  projectId: ProjectIdSchema,
  workflowDefinitionId: WorkflowDefinitionIdSchema.optional(),
  // Intentionally no exactly-one refinement: upsert input is deliberately looser
  // because upsert() merges with existing schedule data. Requiring exactly-one at
  // input time would break partial updates where the caller provides only one field
  // and the other comes from the existing schedule.
  taskDefinitionId: z.string().uuid().optional(),
  workmodeId: WorkmodeIdSchema.optional(),
  trigger: ScheduleTriggerSpecSchema,
  enabled: z.boolean().default(true),
  requestedDeliveryMode: IngressDeliveryModeSchema.default('none'),
  payloadTemplateRef: z.string().min(1).optional(),
});
export type ScheduleUpsertInput = z.infer<typeof ScheduleUpsertInputSchema>;
