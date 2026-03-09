/**
 * Knowledge-index runtime contract types for Nous-OSS.
 *
 * Phase 9.4: Governed refresh, snapshots, and policy-safe discovery results.
 */
import { z } from 'zod';
import {
  MemoryEntryIdSchema,
  ProjectIdSchema,
  TraceIdSchema,
  WorkflowDispatchLineageIdSchema,
  WorkflowExecutionIdSchema,
} from './ids.js';
import { ProjectControlStateSchema } from './mao.js';
import { TraceEvidenceReferenceSchema } from './evidence.js';
import { ConfidenceGovernanceDecisionReasonCodeSchema } from './confidence-governance.js';
import { RelationshipEdgeSchema, RelationshipMappingOutputSchema } from './relationships.js';
import { TaxonomyTagSchema } from './taxonomy.js';
import { ProjectMetaVectorSchema } from './meta-vectors.js';
import { Phase8DiscoveryExportSchema } from './phase8-export.js';

const SHA256_HEX_64_REGEX = /^[a-f0-9]{64}$/;

export const KnowledgeRefreshTriggerSchema = z.enum([
  'manual',
  'workflow',
  'schedule',
]);
export type KnowledgeRefreshTrigger = z.infer<typeof KnowledgeRefreshTriggerSchema>;

export const ProjectKnowledgeRefreshOutcomeSchema = z.enum([
  'updated',
  'cleared',
  'skipped_no_change',
  'failed',
]);
export type ProjectKnowledgeRefreshOutcome = z.infer<
  typeof ProjectKnowledgeRefreshOutcomeSchema
>;

export const ProjectKnowledgeRefreshRequestSchema = z.object({
  projectId: ProjectIdSchema,
  trigger: KnowledgeRefreshTriggerSchema,
  reasonCode: z.string().min(1),
  requestedAt: z.string().datetime(),
  traceId: TraceIdSchema.optional(),
  workflowRunId: WorkflowExecutionIdSchema.optional(),
  dispatchLineageId: WorkflowDispatchLineageIdSchema.optional(),
  scheduleId: z.string().uuid().optional(),
});
export type ProjectKnowledgeRefreshRequest = z.infer<
  typeof ProjectKnowledgeRefreshRequestSchema
>;

export const ProjectKnowledgeRefreshRecordSchema = z.object({
  id: z.string().uuid(),
  projectId: ProjectIdSchema,
  trigger: KnowledgeRefreshTriggerSchema,
  reasonCode: z.string().min(1),
  inputDigest: z.string().regex(SHA256_HEX_64_REGEX),
  outcome: ProjectKnowledgeRefreshOutcomeSchema,
  metaVectorState: z.enum(['updated', 'deleted', 'unchanged']),
  taxonomyTagCount: z.number().int().min(0),
  relationship: RelationshipMappingOutputSchema,
  evidenceRefs: z.array(TraceEvidenceReferenceSchema).default([]),
  workflowRunId: WorkflowExecutionIdSchema.optional(),
  dispatchLineageId: WorkflowDispatchLineageIdSchema.optional(),
  scheduleId: z.string().uuid().optional(),
  sourcePatternIds: z.array(MemoryEntryIdSchema).default([]),
  failureReason: z.string().optional(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
});
export type ProjectKnowledgeRefreshRecord = z.infer<
  typeof ProjectKnowledgeRefreshRecordSchema
>;

export const ProjectTaxonomyAssignmentSchema = z.object({
  id: z.string().min(1),
  projectId: ProjectIdSchema,
  tag: TaxonomyTagSchema,
  refreshRecordId: z.string().uuid(),
  evidenceRefs: z.array(TraceEvidenceReferenceSchema).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ProjectTaxonomyAssignment = z.infer<
  typeof ProjectTaxonomyAssignmentSchema
>;

export const ProjectRelationshipViewSchema = z.object({
  projectId: ProjectIdSchema,
  outgoing: z.array(RelationshipEdgeSchema).default([]),
  incoming: z.array(RelationshipEdgeSchema).default([]),
});
export type ProjectRelationshipView = z.infer<
  typeof ProjectRelationshipViewSchema
>;

export const ProjectKnowledgeSnapshotSchema = z.object({
  projectId: ProjectIdSchema,
  metaVector: ProjectMetaVectorSchema.nullable(),
  taxonomy: z.array(ProjectTaxonomyAssignmentSchema).default([]),
  relationships: ProjectRelationshipViewSchema,
  latestRefresh: ProjectKnowledgeRefreshRecordSchema.nullable(),
  diagnostics: z.object({
    runtimePosture: z.literal('single_process_local'),
    refreshInFlight: z.boolean(),
    lastInputDigest: z.string().regex(SHA256_HEX_64_REGEX).optional(),
    confidenceReasonCodes: z
      .array(ConfidenceGovernanceDecisionReasonCodeSchema)
      .default([]),
  }),
});
export type ProjectKnowledgeSnapshot = z.infer<
  typeof ProjectKnowledgeSnapshotSchema
>;

export const ProjectDiscoveryRequestSchema = z.object({
  requestingProjectId: ProjectIdSchema,
  query: z.string().trim().min(1),
  topK: z.number().int().min(1).max(25).default(10),
  includeMetaVector: z.boolean().default(true),
  includeTaxonomy: z.boolean().default(true),
  includeRelationships: z.boolean().default(true),
  traceId: TraceIdSchema.optional(),
});
export type ProjectDiscoveryRequest = z.infer<
  typeof ProjectDiscoveryRequestSchema
>;

export const ProjectDiscoveryPolicySummarySchema = z.object({
  deniedProjectCount: z.number().int().min(0),
  reasonCodes: z.array(z.string().min(1)).default([]),
  controlState: ProjectControlStateSchema.optional(),
});
export type ProjectDiscoveryPolicySummary = z.infer<
  typeof ProjectDiscoveryPolicySummarySchema
>;

export const ProjectDiscoveryResultSchema = z.object({
  discovery: Phase8DiscoveryExportSchema,
  policy: ProjectDiscoveryPolicySummarySchema,
  snapshot: ProjectKnowledgeSnapshotSchema.nullable(),
});
export type ProjectDiscoveryResult = z.infer<
  typeof ProjectDiscoveryResultSchema
>;
