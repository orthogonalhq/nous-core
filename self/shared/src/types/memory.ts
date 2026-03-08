/**
 * Memory domain types for Nous-OSS.
 *
 * Derived from memory-system.mdx. Covers memory entries, write candidates,
 * mutation governance, experience records, distilled patterns, access policies,
 * retrieval, and STM.
 */
import { z } from 'zod';
import {
  ProjectIdSchema,
  MemoryEntryIdSchema,
  TraceIdSchema,
  MemoryMutationIdSchema,
  MemoryTombstoneIdSchema,
} from './ids.js';
import {
  MemoryTypeSchema,
  MemoryScopeSchema,
  SentimentSchema,
  RetentionPolicySchema,
} from './enums.js';
import { TraceEvidenceReferenceSchema } from './evidence.js';

// --- Access List (used within MemoryAccessPolicy) ---
// The options for canReadFrom / canBeReadBy fields.
// 'all' = fully open, 'none' = fully sealed, or an explicit project list.
export const AccessListSchema = z.union([
  z.literal('all'),
  z.literal('none'),
  z.array(ProjectIdSchema),
]);
export type AccessList = z.infer<typeof AccessListSchema>;

// --- Memory Access Policy ---
// The full policy structure that uses AccessList options.
// From memory-system.mdx "Cross-Project Memory Access".
export const MemoryAccessPolicySchema = z.object({
  canReadFrom: AccessListSchema,
  canBeReadBy: AccessListSchema,
  inheritsGlobal: z.boolean(),
});
export type MemoryAccessPolicy = z.infer<typeof MemoryAccessPolicySchema>;

// --- Default Memory Access Policy ---
// Explicit default for fully open cross-referencing. Consumers apply when
// project config is loaded without an explicit policy. No implicit inheritance.
export const DEFAULT_MEMORY_ACCESS_POLICY: MemoryAccessPolicy = {
  canReadFrom: 'all',
  canBeReadBy: 'all',
  inheritsGlobal: true,
};

// --- Provenance ---
export const ProvenanceSchema = z.object({
  traceId: TraceIdSchema,
  source: z.string(),
  timestamp: z.string().datetime(),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

// --- Mutation Governance ---
export const MemoryMutabilityClassSchema = z.enum([
  'evidence-immutable',
  'domain-versioned',
  'operational-metadata',
  'deletion-tombstone',
]);
export type MemoryMutabilityClass = z.infer<typeof MemoryMutabilityClassSchema>;

export const MemoryLifecycleStatusSchema = z.enum([
  'active',
  'superseded',
  'soft-deleted',
  'hard-deleted',
]);
export type MemoryLifecycleStatus = z.infer<typeof MemoryLifecycleStatusSchema>;

export const MemoryPlacementStateSchema = z.enum([
  'project',
  'global-probation',
  'global-stable',
]);
export type MemoryPlacementState = z.infer<typeof MemoryPlacementStateSchema>;

export const MemoryMutationActionSchema = z.enum([
  'create',
  'supersede',
  'soft-delete',
  'hard-delete',
  'promote-global',
  'demote-project',
  'compact-stm',
]);
export type MemoryMutationAction = z.infer<typeof MemoryMutationActionSchema>;

export const MemoryMutationActorSchema = z.enum([
  'Cortex',
  'pfc',
  'principal',
  'system',
  'core',
  'tool',
  'operator',
]);
export type MemoryMutationActor = z.infer<typeof MemoryMutationActorSchema>;

export const MemoryMutationOutcomeSchema = z.enum([
  'approved',
  'denied',
  'applied',
  'failed',
]);
export type MemoryMutationOutcome = z.infer<typeof MemoryMutationOutcomeSchema>;

export const MemoryMutationReasonCodeSchema = z
  .string()
  .regex(/^MEM-[A-Z0-9][A-Z0-9-]*$/);
export type MemoryMutationReasonCode = z.infer<
  typeof MemoryMutationReasonCodeSchema
>;

export const MemoryDeleteModeSchema = z.enum(['soft', 'hard']);
export type MemoryDeleteMode = z.infer<typeof MemoryDeleteModeSchema>;

export const MemoryMutationPrincipalOverrideSchema = z.object({
  rationale: z.string().min(1),
});
export type MemoryMutationPrincipalOverride = z.infer<
  typeof MemoryMutationPrincipalOverrideSchema
>;

// --- Memory Write Candidate ---
// From memory-system.mdx "MemoryWriteCandidate Structure".
// Proposed by the model, evaluated by the Cortex.
// Phase 4.1: Optional context/action/outcome/reason for experience-record type.
export const MemoryWriteCandidateSchema = z.object({
  content: z.string(),
  type: MemoryTypeSchema,
  scope: MemoryScopeSchema,
  projectId: ProjectIdSchema.optional(),
  confidence: z.number().min(0).max(1),
  sensitivity: z.array(z.string()),
  retention: RetentionPolicySchema,
  provenance: ProvenanceSchema,
  sentiment: SentimentSchema.optional(),
  tags: z.array(z.string()),
  mutabilityClass: MemoryMutabilityClassSchema.optional(),
  context: z.string().optional(),
  action: z.string().optional(),
  outcome: z.string().optional(),
  reason: z.string().optional(),
});
export type MemoryWriteCandidate = z.infer<typeof MemoryWriteCandidateSchema>;

// --- Experience Record Write Candidate ---
// Phase 4.1: Refinement for type === 'experience-record'.
// Requires sentiment, context, action, outcome, reason.
export const ExperienceRecordWriteCandidateSchema = MemoryWriteCandidateSchema.and(
  z.object({
    type: z.literal('experience-record'),
    sentiment: SentimentSchema,
    context: z.string().min(1),
    action: z.string().min(1),
    outcome: z.string().min(1),
    reason: z.string().min(1),
  }),
);
export type ExperienceRecordWriteCandidate = z.infer<
  typeof ExperienceRecordWriteCandidateSchema
>;

// --- Memory Entry ---
// Persisted form of an approved MemoryWriteCandidate.
// mutabilityClass + lifecycleStatus defaults preserve compatibility for legacy entries.
// Phase 4.1: Optional context/action/outcome/reason for experience-record type.
export const MemoryEntrySchema = z.object({
  id: MemoryEntryIdSchema,
  content: z.string(),
  type: MemoryTypeSchema,
  scope: MemoryScopeSchema,
  projectId: ProjectIdSchema.optional(),
  confidence: z.number().min(0).max(1),
  sensitivity: z.array(z.string()),
  retention: RetentionPolicySchema,
  provenance: ProvenanceSchema,
  sentiment: SentimentSchema.optional(),
  tags: z.array(z.string()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  mutabilityClass: MemoryMutabilityClassSchema.default('domain-versioned'),
  lifecycleStatus: MemoryLifecycleStatusSchema.default('active'),
  supersededBy: MemoryEntryIdSchema.optional(),
  deletedAt: z.string().datetime().optional(),
  tombstoneId: MemoryTombstoneIdSchema.optional(),
  placementState: MemoryPlacementStateSchema.default('project'),
  lastMutationId: MemoryMutationIdSchema.optional(),
  embedding: z.array(z.number()).optional(),
  context: z.string().optional(),
  action: z.string().optional(),
  outcome: z.string().optional(),
  reason: z.string().optional(),
});
export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

// --- Memory Mutation Request ---
export const MemoryMutationRequestSchema = z.object({
  id: MemoryMutationIdSchema.optional(),
  action: MemoryMutationActionSchema,
  actor: MemoryMutationActorSchema,
  projectId: ProjectIdSchema.optional(),
  targetEntryId: MemoryEntryIdSchema.optional(),
  replacementCandidate: MemoryWriteCandidateSchema.optional(),
  deleteMode: MemoryDeleteModeSchema.optional(),
  reason: z.string().min(1),
  principalOverride: MemoryMutationPrincipalOverrideSchema.optional(),
  traceId: TraceIdSchema.optional(),
  evidenceRefs: z.array(TraceEvidenceReferenceSchema).default([]),
  requestedAt: z.string().datetime().optional(),
});
export type MemoryMutationRequest = z.infer<typeof MemoryMutationRequestSchema>;

// --- Memory Mutation Audit Record ---
export const MemoryMutationAuditRecordSchema = z.object({
  id: MemoryMutationIdSchema,
  sequence: z.number().int().positive(),
  action: MemoryMutationActionSchema,
  actor: MemoryMutationActorSchema,
  outcome: MemoryMutationOutcomeSchema,
  reasonCode: MemoryMutationReasonCodeSchema,
  reason: z.string(),
  projectId: ProjectIdSchema.optional(),
  targetEntryId: MemoryEntryIdSchema.optional(),
  resultingEntryId: MemoryEntryIdSchema.optional(),
  tombstoneId: MemoryTombstoneIdSchema.optional(),
  traceId: TraceIdSchema.optional(),
  evidenceRefs: z.array(TraceEvidenceReferenceSchema).default([]),
  occurredAt: z.string().datetime(),
});
export type MemoryMutationAuditRecord = z.infer<
  typeof MemoryMutationAuditRecordSchema
>;

// --- Deletion Tombstone ---
export const MemoryTombstoneSchema = z.object({
  id: MemoryTombstoneIdSchema,
  targetEntryId: MemoryEntryIdSchema,
  targetContentHash: z.string().regex(/^[a-f0-9]{64}$/),
  deletedByMutationId: MemoryMutationIdSchema,
  projectId: ProjectIdSchema.optional(),
  reason: z.string(),
  createdAt: z.string().datetime(),
});
export type MemoryTombstone = z.infer<typeof MemoryTombstoneSchema>;

// --- STM Compaction Summary ---
export const StmCompactionSourceRefSchema = z.object({
  timestamp: z.string().datetime(),
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type StmCompactionSourceRef = z.infer<typeof StmCompactionSourceRefSchema>;

export const StmCompactionSummarySchema = z.object({
  id: MemoryMutationIdSchema,
  projectId: ProjectIdSchema,
  summary: z.string(),
  sourceEntryRefs: z.array(StmCompactionSourceRefSchema),
  sourceEntryCount: z.number().int().nonnegative(),
  trigger: z.enum(['token-threshold', 'manual']),
  preCompactionTokenCount: z.number().int().min(0),
  postCompactionTokenCount: z.number().int().min(0),
  retainedEntryCount: z.number().int().min(0),
  generatedAt: z.string().datetime(),
});
export type StmCompactionSummary = z.infer<typeof StmCompactionSummarySchema>;

// --- Experience Record ---
// From memory-system.mdx "Experience Records".
// Specialized MemoryEntry with required sentiment and structured outcome fields.
export const ExperienceRecordSchema = MemoryEntrySchema.extend({
  type: z.literal('experience-record'),
  sentiment: SentimentSchema,
  context: z.string(),
  action: z.string(),
  outcome: z.string(),
  reason: z.string(),
});
export type ExperienceRecord = z.infer<typeof ExperienceRecordSchema>;

// --- Distilled Pattern ---
// From memory-system.mdx "Distilled Patterns".
// Phase 4.3: evidenceRefs required for provenance; basedOn/supersedes non-empty.
// Compressed knowledge derived from multiple experience records.
export const DistilledPatternSchema = MemoryEntrySchema.extend({
  type: z.literal('distilled-pattern'),
  basedOn: z.array(MemoryEntryIdSchema).min(1),
  supersedes: z.array(MemoryEntryIdSchema).min(1),
  evidenceRefs: z.array(TraceEvidenceReferenceSchema).min(1),
});
export type DistilledPattern = z.infer<typeof DistilledPatternSchema>;

// --- Retrieval Result ---
// Scored memory returned from the retrieval engine.
export const RetrievalResultSchema = z.object({
  entry: MemoryEntrySchema,
  score: z.number(),
  components: z.object({
    similarity: z.number(),
    sentimentWeight: z.number(),
    recency: z.number(),
    confidence: z.number(),
  }),
});
export type RetrievalResult = z.infer<typeof RetrievalResultSchema>;

// --- Memory Query Filter ---
// Filter for querying LTM entries.
export const MemoryQueryFilterSchema = z.object({
  type: MemoryTypeSchema.optional(),
  scope: MemoryScopeSchema.optional(),
  projectId: ProjectIdSchema.optional(),
  tags: z.array(z.string()).optional(),
  lifecycleStatus: MemoryLifecycleStatusSchema.optional(),
  placementState: MemoryPlacementStateSchema.optional(),
  includeSuperseded: z.boolean().optional(),
  includeDeleted: z.boolean().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().min(0).optional(),
});
export type MemoryQueryFilter = z.infer<typeof MemoryQueryFilterSchema>;

// --- STM Entry ---
// A single short-term memory entry.
export const StmEntrySchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string(),
  timestamp: z.string().datetime(),
  metadata: z.record(z.unknown()).optional(),
});
export type StmEntry = z.infer<typeof StmEntrySchema>;

export const StmCompactionTriggerSchema = z.enum([
  'none',
  'token-threshold',
  'manual',
]);
export type StmCompactionTrigger = z.infer<typeof StmCompactionTriggerSchema>;

export const StmCompactionPolicySchema = z
  .object({
    maxContextTokens: z.number().int().positive(),
    targetContextTokens: z.number().int().positive(),
    minEntriesBeforeCompaction: z.number().int().min(1),
    retainedRecentEntries: z.number().int().min(1),
  })
  .superRefine((value, ctx) => {
    if (value.targetContextTokens >= value.maxContextTokens) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'targetContextTokens must be less than maxContextTokens',
        path: ['targetContextTokens'],
      });
    }

    if (value.retainedRecentEntries >= value.minEntriesBeforeCompaction) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'retainedRecentEntries must be less than minEntriesBeforeCompaction',
        path: ['retainedRecentEntries'],
      });
    }
  });
export type StmCompactionPolicy = z.infer<typeof StmCompactionPolicySchema>;

export const DEFAULT_STM_COMPACTION_POLICY: StmCompactionPolicy = {
  maxContextTokens: 1024,
  targetContextTokens: 640,
  minEntriesBeforeCompaction: 8,
  retainedRecentEntries: 4,
};

export const StmCompactionStateSchema = z.object({
  requiresCompaction: z.boolean(),
  trigger: StmCompactionTriggerSchema,
  currentTokenCount: z.number().int().min(0),
  maxContextTokens: z.number().int().positive(),
  targetContextTokens: z.number().int().positive(),
});
export type StmCompactionState = z.infer<typeof StmCompactionStateSchema>;

// --- STM Context ---
// Current working context — recent entries plus summary of evicted context.
export const StmContextSchema = z.object({
  entries: z.array(StmEntrySchema),
  summary: z.string().optional(),
  tokenCount: z.number().int().min(0),
  compactionState: StmCompactionStateSchema.optional(),
});
export type StmContext = z.infer<typeof StmContextSchema>;

// --- Retrieval Query ---
// Query for the retrieval engine.
export const RetrievalQuerySchema = z.object({
  situation: z.string(),
  projectId: ProjectIdSchema.optional(),
  scope: MemoryScopeSchema.optional(),
  tokenBudget: z.number().positive(),
  filters: MemoryQueryFilterSchema.optional(),
  /** Phase 6.1: Explicit target projects for cross-project retrieval. No hidden joins. */
  targetProjectIds: z.array(ProjectIdSchema).optional(),
});
export type RetrievalQuery = z.infer<typeof RetrievalQuerySchema>;

// --- Experience Cluster ---
// A cluster of related experience records identified for distillation.
export const ExperienceClusterSchema = z.object({
  records: z.array(ExperienceRecordSchema),
  clusterKey: z.string(),
  projectId: ProjectIdSchema.optional(),
});
export type ExperienceCluster = z.infer<typeof ExperienceClusterSchema>;

// --- Distillation Result ---
// Result of a distillation pass.
export const DistillationResultSchema = z.object({
  patternsCreated: z.array(DistilledPatternSchema),
  recordsSuperseded: z.array(MemoryEntryIdSchema),
  clustersProcessed: z.number().int().min(0),
});
export type DistillationResult = z.infer<typeof DistillationResultSchema>;
