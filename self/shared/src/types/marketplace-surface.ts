import { z } from 'zod';
import { TraceEvidenceReferenceSchema } from './evidence.js';
import {
  EscalationIdSchema,
  ProjectIdSchema,
  WorkflowExecutionIdSchema,
  WorkflowNodeDefinitionIdSchema,
} from './ids.js';
import {
  MaintainerIdentitySchema,
  RegistryAppealRecordSchema,
  RegistryAppealStatusSchema,
  RegistryCompatibilityStateSchema,
  RegistryDistributionStatusSchema,
  RegistryGovernanceActionSchema,
  RegistryGovernanceActionTypeSchema,
  RegistryInstallEligibilitySnapshotSchema,
  RegistryModerationStateSchema,
  RegistryPackageSchema,
  RegistryReleaseSchema,
  RegistryTrustTierSchema,
} from './registry.js';
import {
  NudgeCandidateSchema,
  NudgeDecisionSchema,
  NudgeDeliveryRecordSchema,
  NudgeDeliverySurfaceSchema,
  NudgeFeedbackEventSchema,
  NudgeSuppressionActionSchema,
  NudgeSuppressionRecordSchema,
  NudgeSuppressionScopeSchema,
} from './nudge.js';

export const MarketplaceSurfaceTargetSchema = z.enum([
  'projects',
  'mao',
  'chat',
  'artifact',
]);
export type MarketplaceSurfaceTarget = z.infer<
  typeof MarketplaceSurfaceTargetSchema
>;

export const MarketplaceSurfaceLinkSchema = z.object({
  target: MarketplaceSurfaceTargetSchema,
  packageId: z.string().min(1),
  projectId: ProjectIdSchema.optional(),
  releaseId: z.string().min(1).optional(),
  candidateId: z.string().min(1).optional(),
  workflowRunId: WorkflowExecutionIdSchema.optional(),
  nodeDefinitionId: WorkflowNodeDefinitionIdSchema.optional(),
  escalationId: EscalationIdSchema.optional(),
  evidenceRef: z.string().min(1).optional(),
});
export type MarketplaceSurfaceLink = z.infer<typeof MarketplaceSurfaceLinkSchema>;

export const RegistryBrowseRequestSchema = z.object({
  query: z.string().trim().default(''),
  trustTiers: z.array(RegistryTrustTierSchema).default([]),
  distributionStatuses: z.array(RegistryDistributionStatusSchema).default([]),
  compatibilityStates: z.array(RegistryCompatibilityStateSchema).default([]),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
  projectId: ProjectIdSchema.optional(),
});
export type RegistryBrowseRequest = z.infer<typeof RegistryBrowseRequestSchema>;

export const RegistryBrowseListItemSchema = z.object({
  package: RegistryPackageSchema,
  latestRelease: RegistryReleaseSchema.nullable(),
  maintainers: z.array(MaintainerIdentitySchema).default([]),
  trustEligibility: RegistryInstallEligibilitySnapshotSchema.nullable(),
  deepLinks: z.array(MarketplaceSurfaceLinkSchema).default([]),
});
export type RegistryBrowseListItem = z.infer<typeof RegistryBrowseListItemSchema>;

export const RegistryBrowseResultSchema = z.object({
  query: RegistryBrowseRequestSchema,
  items: z.array(RegistryBrowseListItemSchema).default([]),
  totalCount: z.number().int().min(0),
  generatedAt: z.string().datetime(),
});
export type RegistryBrowseResult = z.infer<typeof RegistryBrowseResultSchema>;

export const RegistryGovernanceTimelineRequestSchema = z.object({
  packageId: z.string().min(1).optional(),
  releaseId: z.string().min(1).optional(),
  maintainerId: z.string().min(1).optional(),
  actionTypes: z.array(RegistryGovernanceActionTypeSchema).default([]),
  limit: z.number().int().min(1).max(100).default(50),
});
export type RegistryGovernanceTimelineRequest = z.infer<
  typeof RegistryGovernanceTimelineRequestSchema
>;

export const RegistryGovernanceTimelineResultSchema = z.object({
  actions: z.array(RegistryGovernanceActionSchema).default([]),
  generatedAt: z.string().datetime(),
});
export type RegistryGovernanceTimelineResult = z.infer<
  typeof RegistryGovernanceTimelineResultSchema
>;

export const RegistryAppealQuerySchema = z.object({
  packageId: z.string().min(1).optional(),
  maintainerId: z.string().min(1).optional(),
  statuses: z.array(RegistryAppealStatusSchema).default([]),
  includeResolved: z.boolean().default(true),
  limit: z.number().int().min(1).max(100).default(50),
});
export type RegistryAppealQuery = z.infer<typeof RegistryAppealQuerySchema>;

export const RegistryAppealQueryResultSchema = z.object({
  appeals: z.array(RegistryAppealRecordSchema).default([]),
  generatedAt: z.string().datetime(),
});
export type RegistryAppealQueryResult = z.infer<
  typeof RegistryAppealQueryResultSchema
>;

export const RegistryPackageDetailSnapshotSchema = z.object({
  package: RegistryPackageSchema,
  latestRelease: RegistryReleaseSchema.nullable(),
  releases: z.array(RegistryReleaseSchema).default([]),
  maintainers: z.array(MaintainerIdentitySchema).default([]),
  governanceTimeline: z.array(RegistryGovernanceActionSchema).default([]),
  appeals: z.array(RegistryAppealRecordSchema).default([]),
  trustEligibility: RegistryInstallEligibilitySnapshotSchema.nullable(),
  deepLinks: z.array(MarketplaceSurfaceLinkSchema).default([]),
  generatedAt: z.string().datetime(),
});
export type RegistryPackageDetailSnapshot = z.infer<
  typeof RegistryPackageDetailSnapshotSchema
>;

export const MarketplaceModerationDashboardRequestSchema = z.object({
  query: z.string().trim().default(''),
  statuses: z.array(RegistryModerationStateSchema).default([]),
  includeResolvedAppeals: z.boolean().default(false),
});
export type MarketplaceModerationDashboardRequest = z.infer<
  typeof MarketplaceModerationDashboardRequestSchema
>;

export const MarketplaceModerationRowSchema = z.object({
  package: RegistryPackageSchema,
  latestRelease: RegistryReleaseSchema.nullable(),
  latestGovernanceAction: RegistryGovernanceActionSchema.nullable(),
  latestAppeal: RegistryAppealRecordSchema.nullable(),
  escalationIds: z.array(EscalationIdSchema).default([]),
  deepLinks: z.array(MarketplaceSurfaceLinkSchema).default([]),
});
export type MarketplaceModerationRow = z.infer<
  typeof MarketplaceModerationRowSchema
>;

export const MarketplaceModerationDashboardSnapshotSchema = z.object({
  rows: z.array(MarketplaceModerationRowSchema).default([]),
  pendingAppealCount: z.number().int().min(0),
  activeHoldCount: z.number().int().min(0),
  delistedCount: z.number().int().min(0),
  generatedAt: z.string().datetime(),
});
export type MarketplaceModerationDashboardSnapshot = z.infer<
  typeof MarketplaceModerationDashboardSnapshotSchema
>;

export const MarketplaceNudgeFeedRequestSchema = z.object({
  projectId: ProjectIdSchema.optional(),
  surface: NudgeDeliverySurfaceSchema,
  signalRefs: z.array(z.string().min(1)).default([]),
  limit: z.number().int().min(1).max(20).default(5),
});
export type MarketplaceNudgeFeedRequest = z.infer<
  typeof MarketplaceNudgeFeedRequestSchema
>;

export const MarketplaceNudgeCardSchema = z.object({
  candidate: NudgeCandidateSchema,
  decision: NudgeDecisionSchema,
  delivery: NudgeDeliveryRecordSchema,
  trustEligibility: RegistryInstallEligibilitySnapshotSchema.nullable(),
  whyThis: z.array(z.string().min(1)).default([]),
  availableSuppressionActions: z.array(NudgeSuppressionActionSchema).default([]),
  activeSuppressions: z.array(NudgeSuppressionRecordSchema).default([]),
  deepLinks: z.array(MarketplaceSurfaceLinkSchema).default([]),
});
export type MarketplaceNudgeCard = z.infer<typeof MarketplaceNudgeCardSchema>;

export const MarketplaceNudgeFeedSnapshotSchema = z.object({
  projectId: ProjectIdSchema.optional(),
  surface: NudgeDeliverySurfaceSchema,
  cards: z.array(MarketplaceNudgeCardSchema).default([]),
  blockedDeliveries: z.array(NudgeDeliveryRecordSchema).default([]),
  generatedAt: z.string().datetime(),
});
export type MarketplaceNudgeFeedSnapshot = z.infer<
  typeof MarketplaceNudgeFeedSnapshotSchema
>;

export const NudgeSuppressionMutationInputSchema = z.object({
  candidateId: z.string().min(1),
  decisionId: z.string().min(1).optional(),
  action: NudgeSuppressionActionSchema,
  scope: NudgeSuppressionScopeSchema,
  targetRef: z.string().min(1),
  projectId: ProjectIdSchema.optional(),
  surface: NudgeDeliverySurfaceSchema,
  durationMinutes: z.number().int().min(1).optional(),
  evidenceRefs: z.array(TraceEvidenceReferenceSchema).min(1),
  occurredAt: z.string().datetime().optional(),
});
export type NudgeSuppressionMutationInput = z.infer<
  typeof NudgeSuppressionMutationInputSchema
>;

export const NudgeSuppressionQuerySchema = z.object({
  projectId: ProjectIdSchema.optional(),
  surface: NudgeDeliverySurfaceSchema.optional(),
  scope: NudgeSuppressionScopeSchema.optional(),
  candidateId: z.string().min(1).optional(),
});
export type NudgeSuppressionQuery = z.infer<typeof NudgeSuppressionQuerySchema>;

export const NudgeSuppressionQueryResultSchema = z.object({
  suppressions: z.array(NudgeSuppressionRecordSchema).default([]),
  generatedAt: z.string().datetime(),
});
export type NudgeSuppressionQueryResult = z.infer<
  typeof NudgeSuppressionQueryResultSchema
>;

export const MarketplaceNudgeFeedbackInputSchema = z.object({
  candidateId: z.string().min(1),
  decisionId: z.string().min(1).optional(),
  deliveryId: z.string().uuid().optional(),
  eventType: NudgeFeedbackEventSchema.shape.event_type,
  surface: NudgeDeliverySurfaceSchema,
  evidenceRefs: z.array(TraceEvidenceReferenceSchema).min(1),
  occurredAt: z.string().datetime().optional(),
});
export type MarketplaceNudgeFeedbackInput = z.infer<
  typeof MarketplaceNudgeFeedbackInputSchema
>;
