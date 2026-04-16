/**
 * Unified notification type system for Nous-OSS.
 *
 * Covers five notification kinds (escalation, alert, health, panel, toast)
 * with a shared base schema and kind-specific detail schemas, validated via
 * Zod discriminated union.
 */
import { z } from 'zod';
import { EscalationIdSchema } from './ids.js';
import { EscalationPrioritySchema } from './enums.js';
import {
  InAppEscalationSourceSchema,
  InAppEscalationStatusSchema,
  InAppEscalationSurfaceSchema,
  InAppEscalationAcknowledgementSchema,
} from './escalation.js';
import {
  WorkflowExecutionIdSchema,
  WorkflowNodeDefinitionIdSchema,
  TraceIdSchema,
} from './ids.js';
import { ProjectControlStateSchema } from './mao.js';
import { PanelBridgeNotificationLevelSchema } from './panel-bridge-protocol.js';

// --- Enums ---

export const NotificationLevelSchema = z.enum([
  'info',
  'warning',
  'error',
  'critical',
]);
export type NotificationLevel = z.infer<typeof NotificationLevelSchema>;

export const NotificationStatusSchema = z.enum([
  'active',
  'acknowledged',
  'dismissed',
]);
export type NotificationStatus = z.infer<typeof NotificationStatusSchema>;

export const NotificationKindSchema = z.enum([
  'escalation',
  'alert',
  'health',
  'panel',
  'toast',
]);
export type NotificationKind = z.infer<typeof NotificationKindSchema>;

// --- Base Fields ---

export const NotificationBaseFieldsSchema = z.object({
  id: z.string().uuid(),
  kind: NotificationKindSchema,
  projectId: z.string().min(1).nullable(),
  level: NotificationLevelSchema,
  title: z.string().min(1),
  message: z.string().min(1),
  status: NotificationStatusSchema,
  transient: z.boolean(),
  source: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// --- Subtype Detail Schemas ---

export const EscalationDetailsSchema = z.object({
  escalationId: EscalationIdSchema,
  severity: EscalationPrioritySchema,
  source: InAppEscalationSourceSchema,
  status: InAppEscalationStatusSchema,
  routeTargets: z.array(InAppEscalationSurfaceSchema).min(1),
  requiredAction: z.string().min(1).optional(),
  workflowRunId: WorkflowExecutionIdSchema.optional(),
  nodeDefinitionId: WorkflowNodeDefinitionIdSchema.optional(),
  traceId: TraceIdSchema.optional(),
  controlState: ProjectControlStateSchema.optional(),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  acknowledgements: z
    .array(InAppEscalationAcknowledgementSchema)
    .default([]),
});

export const AlertDetailsSchema = z.object({
  category: z.enum(['budget-warning', 'budget-exceeded']),
  utilizationPercent: z.number().nonnegative(),
  currentSpendUsd: z.number().nonnegative(),
  budgetCeilingUsd: z.number().nonnegative(),
  thresholdPercent: z.number().min(0).max(100).optional(),
});

export const HealthDetailsSchema = z.object({
  issueId: z.string().min(1),
  severity: z.enum(['info', 'warning', 'error', 'critical']),
});

export const PanelDetailsSchema = z.object({
  panelId: z.string().min(1),
  level: PanelBridgeNotificationLevelSchema,
  context: z.record(z.string(), z.unknown()).optional(),
});

export const ToastDetailsSchema = z.object({
  severity: z.enum(['info', 'warning', 'error']),
  dismissible: z.boolean().default(true),
  durationMs: z.number().positive().nullable().default(8000),
});

// --- Kind-specific Record Schemas ---

export const EscalationNotificationSchema =
  NotificationBaseFieldsSchema.extend({
    kind: z.literal('escalation'),
    escalation: EscalationDetailsSchema,
  });

export const AlertNotificationSchema = NotificationBaseFieldsSchema.extend({
  kind: z.literal('alert'),
  alert: AlertDetailsSchema,
});

export const HealthNotificationSchema = NotificationBaseFieldsSchema.extend({
  kind: z.literal('health'),
  health: HealthDetailsSchema,
});

export const PanelNotificationSchema = NotificationBaseFieldsSchema.extend({
  kind: z.literal('panel'),
  panel: PanelDetailsSchema,
});

export const ToastNotificationSchema = NotificationBaseFieldsSchema.extend({
  kind: z.literal('toast'),
  toast: ToastDetailsSchema,
});

// --- Discriminated Union ---

export const NotificationRecordSchema = z.discriminatedUnion('kind', [
  EscalationNotificationSchema,
  AlertNotificationSchema,
  HealthNotificationSchema,
  PanelNotificationSchema,
  ToastNotificationSchema,
]);
export type NotificationRecord = z.infer<typeof NotificationRecordSchema>;

// --- Filter ---

export const NotificationFilterSchema = z.object({
  projectId: z.string().min(1).optional(),
  kind: NotificationKindSchema.optional(),
  status: NotificationStatusSchema.optional(),
  transient: z.boolean().optional(),
  level: NotificationLevelSchema.optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().min(0).optional(),
});
export type NotificationFilter = z.infer<typeof NotificationFilterSchema>;

// --- Raise Input ---
// Omits id, level, status, createdAt, updatedAt (derived by service)
// Kind-specific detail payload is required per kind

export const RaiseNotificationInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('escalation'),
    projectId: z.string().min(1).nullable(),
    title: z.string().min(1),
    message: z.string().min(1),
    transient: z.boolean(),
    source: z.string().min(1),
    escalation: EscalationDetailsSchema,
  }),
  z.object({
    kind: z.literal('alert'),
    projectId: z.string().min(1).nullable(),
    title: z.string().min(1),
    message: z.string().min(1),
    transient: z.boolean(),
    source: z.string().min(1),
    alert: AlertDetailsSchema,
  }),
  z.object({
    kind: z.literal('health'),
    projectId: z.string().min(1).nullable(),
    title: z.string().min(1),
    message: z.string().min(1),
    transient: z.boolean(),
    source: z.string().min(1),
    health: HealthDetailsSchema,
  }),
  z.object({
    kind: z.literal('panel'),
    projectId: z.string().min(1).nullable(),
    title: z.string().min(1),
    message: z.string().min(1),
    transient: z.boolean(),
    source: z.string().min(1),
    panel: PanelDetailsSchema,
  }),
  z.object({
    kind: z.literal('toast'),
    projectId: z.string().min(1).nullable(),
    title: z.string().min(1),
    message: z.string().min(1),
    transient: z.boolean(),
    source: z.string().min(1),
    toast: ToastDetailsSchema,
  }),
]);
export type RaiseNotificationInput = z.infer<
  typeof RaiseNotificationInputSchema
>;
