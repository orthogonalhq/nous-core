/**
 * Memory domain types for Nous-OSS.
 *
 * Derived from memory-system.mdx. Covers memory entries, write candidates,
 * experience records, distilled patterns, access policies, retrieval, and STM.
 */
import { z } from 'zod';
import {
  ProjectIdSchema,
  MemoryEntryIdSchema,
  TraceIdSchema,
} from './ids.js';
import {
  MemoryTypeSchema,
  MemoryScopeSchema,
  SentimentSchema,
  RetentionPolicySchema,
} from './enums.js';

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

// --- Provenance ---
export const ProvenanceSchema = z.object({
  traceId: TraceIdSchema,
  source: z.string(),
  timestamp: z.string().datetime(),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

// --- Memory Write Candidate ---
// From memory-system.mdx "MemoryWriteCandidate Structure".
// Proposed by the model, evaluated by the PFC.
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
});
export type MemoryWriteCandidate = z.infer<typeof MemoryWriteCandidateSchema>;

// --- Memory Entry ---
// Persisted form of an approved MemoryWriteCandidate.
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
  supersededBy: MemoryEntryIdSchema.optional(),
  embedding: z.array(z.number()).optional(),
});
export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

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
// Compressed knowledge derived from multiple experience records.
export const DistilledPatternSchema = MemoryEntrySchema.extend({
  type: z.literal('distilled-pattern'),
  basedOn: z.array(MemoryEntryIdSchema),
  supersedes: z.array(MemoryEntryIdSchema),
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

// --- STM Context ---
// Current working context — recent entries plus summary of evicted context.
export const StmContextSchema = z.object({
  entries: z.array(StmEntrySchema),
  summary: z.string().optional(),
  tokenCount: z.number().int().min(0),
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
