/**
 * Canonical project operating-surface projection contracts.
 *
 * These shapes project dashboard, configuration, blocked-action, schedule,
 * and escalation truth for the Projects and chat surfaces.
 */
import { z } from 'zod';
import { MaoProjectControlProjectionSchema } from './mao.js';
import { EndpointTrustSurfaceSummarySchema } from './endpoint-trust.js';
import { ProjectIdSchema } from './ids.js';
import {
  ProjectConfigSchema,
  ProjectIdentityContractSchema,
  ProjectPackageDefaultIntakeSchema,
} from './project.js';
import {
  InAppEscalationRecordSchema,
  ProjectEscalationQueueSnapshotSchema,
} from './escalation.js';
import { ScheduleDefinitionSchema } from './scheduler.js';
import { VoiceSessionProjectionSchema } from './voice-control.js';
import {
  ProjectWorkflowSurfaceSnapshotSchema,
  WorkflowRuntimeAvailabilitySchema,
} from './workflow-monitoring.js';

export const ProjectBlockedActionSchema = z.object({
  action: z.enum([
    'edit_project_configuration',
    'update_schedule',
    'acknowledge_escalation',
    'resume_project',
    'pause_project',
    'hard_stop_project',
  ]),
  allowed: z.boolean(),
  reasonCode: z.string().min(1).optional(),
  message: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)).default([]),
});
export type ProjectBlockedAction = z.infer<typeof ProjectBlockedActionSchema>;

export const ProjectHealthSummarySchema = z.object({
  overallStatus: z.enum([
    'healthy',
    'attention_required',
    'blocked',
    'degraded',
  ]),
  runtimeAvailability: WorkflowRuntimeAvailabilitySchema,
  activeRunStatus: z.string().min(1).optional(),
  blockedNodeCount: z.number().int().min(0),
  waitingNodeCount: z.number().int().min(0),
  enabledScheduleCount: z.number().int().min(0),
  overdueScheduleCount: z.number().int().min(0),
  openEscalationCount: z.number().int().min(0),
  urgentEscalationCount: z.number().int().min(0),
});
export type ProjectHealthSummary = z.infer<typeof ProjectHealthSummarySchema>;

export const ProjectDashboardSnapshotSchema = z.object({
  project: ProjectIdentityContractSchema,
  health: ProjectHealthSummarySchema,
  controlProjection: MaoProjectControlProjectionSchema.nullable(),
  workflowSnapshot: ProjectWorkflowSurfaceSnapshotSchema.nullable(),
  schedules: z.array(ScheduleDefinitionSchema).default([]),
  openEscalations: z.array(InAppEscalationRecordSchema).default([]),
  blockedActions: z.array(ProjectBlockedActionSchema).default([]),
  packageDefaultIntake: z.array(ProjectPackageDefaultIntakeSchema).default([]),
  diagnostics: z.object({
    runtimePosture: z.literal('single_process_local'),
    degradedReasonCode: z.string().min(1).optional(),
  }),
});
export type ProjectDashboardSnapshot = z.infer<
  typeof ProjectDashboardSnapshotSchema
>;

export const ProjectConfigFieldProvenanceSchema = z.object({
  field: z.string().min(1),
  source: z.enum([
    'project_override',
    'package_default',
    'system_default',
    'derived_read_only',
  ]),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  lockedByPolicy: z.boolean().default(false),
});
export type ProjectConfigFieldProvenance = z.infer<
  typeof ProjectConfigFieldProvenanceSchema
>;

export const ProjectConfigurationSnapshotSchema = z.object({
  projectId: ProjectIdSchema,
  updatedAt: z.string().datetime(),
  config: ProjectConfigSchema,
  schedules: z.array(ScheduleDefinitionSchema).default([]),
  blockedActions: z.array(ProjectBlockedActionSchema).default([]),
  fieldProvenance: z.array(ProjectConfigFieldProvenanceSchema).default([]),
});
export type ProjectConfigurationSnapshot = z.infer<
  typeof ProjectConfigurationSnapshotSchema
>;

export const ProjectConfigurationUpdateInputSchema = z.object({
  projectId: ProjectIdSchema,
  expectedUpdatedAt: z.string().datetime().optional(),
  updates: z
    .object({
      type: ProjectConfigSchema.shape.type.optional(),
      pfcTier: ProjectConfigSchema.shape.pfcTier.optional(),
      governanceDefaults: ProjectConfigSchema.shape.governanceDefaults.optional(),
      modelAssignments: ProjectConfigSchema.shape.modelAssignments.optional(),
      memoryAccessPolicy: ProjectConfigSchema.shape.memoryAccessPolicy.optional(),
      retrievalBudgetTokens:
        ProjectConfigSchema.shape.retrievalBudgetTokens.optional(),
      escalationPreferences:
        ProjectConfigSchema.shape.escalationPreferences.optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: 'At least one configuration field must be updated',
    }),
});
export type ProjectConfigurationUpdateInput = z.infer<
  typeof ProjectConfigurationUpdateInputSchema
>;

export const MobileOperationsSnapshotSchema = z.object({
  project: ProjectIdentityContractSchema,
  dashboard: ProjectDashboardSnapshotSchema,
  escalationQueue: ProjectEscalationQueueSnapshotSchema,
  voiceSession: VoiceSessionProjectionSchema.nullable(),
  endpointTrust: EndpointTrustSurfaceSummarySchema.nullable(),
  diagnostics: z.object({
    runtimePosture: z.literal('single_process_local'),
    degradedReasonCode: z.string().min(1).optional(),
  }),
  generatedAt: z.string().datetime(),
});
export type MobileOperationsSnapshot = z.infer<
  typeof MobileOperationsSnapshotSchema
>;
