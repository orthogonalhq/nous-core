/**
 * Escalation response and in-app queue types for Nous-OSS.
 *
 * Supports the IEscalationService interface.
 */
import { z } from 'zod';
import {
  EscalationChannelSchema,
  EscalationPrioritySchema,
} from './enums.js';
import {
  EscalationIdSchema,
  ProjectIdSchema,
  TraceIdSchema,
  WorkflowExecutionIdSchema,
  WorkflowNodeDefinitionIdSchema,
} from './ids.js';
import { ProjectControlStateSchema } from './mao.js';

// --- Escalation Response ---
// Principal's response to an escalation.
export const EscalationResponseSchema = z.object({
  escalationId: EscalationIdSchema,
  action: z.string(),
  message: z.string().optional(),
  respondedAt: z.string().datetime(),
  channel: EscalationChannelSchema,
});
export type EscalationResponse = z.infer<typeof EscalationResponseSchema>;

export const InAppEscalationSurfaceSchema = z.enum([
  'projects',
  'chat',
  'mao',
  'mobile',
]);
export type InAppEscalationSurface = z.infer<
  typeof InAppEscalationSurfaceSchema
>;

export const InAppEscalationStatusSchema = z.enum([
  'queued',
  'visible',
  'acknowledged',
  'resolved',
  'delivery_degraded',
]);
export type InAppEscalationStatus = z.infer<
  typeof InAppEscalationStatusSchema
>;

export const InAppEscalationSourceSchema = z.enum([
  'workflow',
  'control',
  'scheduler',
  'system',
]);
export type InAppEscalationSource = z.infer<
  typeof InAppEscalationSourceSchema
>;

export const EscalationAcknowledgementSurfaceSchema = z.enum([
  'projects',
  'chat',
  'mao',
  'communication_gateway',
  'mobile',
]);
export type EscalationAcknowledgementSurface = z.infer<
  typeof EscalationAcknowledgementSurfaceSchema
>;

export const InAppEscalationAcknowledgementSchema = z.object({
  surface: EscalationAcknowledgementSurfaceSchema,
  actorType: z.enum(['principal', 'system']),
  acknowledgedAt: z.string().datetime(),
  note: z.string().min(1).optional(),
  evidenceRefs: z.array(z.string().min(1)).default([]),
});
export type InAppEscalationAcknowledgement = z.infer<
  typeof InAppEscalationAcknowledgementSchema
>;

export const InAppEscalationRecordSchema = z.object({
  escalationId: EscalationIdSchema,
  projectId: ProjectIdSchema,
  source: InAppEscalationSourceSchema,
  severity: EscalationPrioritySchema,
  title: z.string().min(1),
  message: z.string().min(1),
  status: InAppEscalationStatusSchema,
  routeTargets: z.array(InAppEscalationSurfaceSchema).min(1),
  requiredAction: z.string().min(1).optional(),
  workflowRunId: WorkflowExecutionIdSchema.optional(),
  nodeDefinitionId: WorkflowNodeDefinitionIdSchema.optional(),
  traceId: TraceIdSchema.optional(),
  controlState: ProjectControlStateSchema.optional(),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  acknowledgements: z.array(InAppEscalationAcknowledgementSchema).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type InAppEscalationRecord = z.infer<
  typeof InAppEscalationRecordSchema
>;

export const ProjectEscalationQueueSnapshotSchema = z.object({
  projectId: ProjectIdSchema,
  items: z.array(InAppEscalationRecordSchema).default([]),
  openCount: z.number().int().min(0),
  acknowledgedCount: z.number().int().min(0),
  urgentCount: z.number().int().min(0),
});
export type ProjectEscalationQueueSnapshot = z.infer<
  typeof ProjectEscalationQueueSnapshotSchema
>;

export const AcknowledgeInAppEscalationInputSchema = z.object({
  escalationId: EscalationIdSchema,
  surface: EscalationAcknowledgementSurfaceSchema,
  actorType: z.enum(['principal', 'system']),
  note: z.string().min(1).optional(),
});
export type AcknowledgeInAppEscalationInput = z.infer<
  typeof AcknowledgeInAppEscalationInputSchema
>;
