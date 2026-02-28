/**
 * Discovery orchestrator types for Nous-OSS.
 *
 * Phase 6.3: Query-time project selection combining meta-vectors,
 * taxonomy, and relationship graph.
 * Phase 6.4: Explainability, benchmark acceptance, policy leakage regression.
 */
import { z } from 'zod';
import { ProjectIdSchema, TraceIdSchema } from './ids.js';
import { CrossProjectRecommendationExplainabilitySchema } from './explainability.js';
import { EscalationSignalSchema } from './confidence-governance.js';

export const DiscoveryOrchestratorInputSchema = z.object({
  queryVector: z.array(z.number()),
  topK: z.number().int().min(1),
  requestingProjectId: ProjectIdSchema,
  includeMetaVector: z.boolean().default(true),
  includeTaxonomy: z.boolean().default(true),
  includeRelationships: z.boolean().default(true),
});
export type DiscoveryOrchestratorInput = z.infer<
  typeof DiscoveryOrchestratorInputSchema
>;

export const DiscoveryResultSchema = z.object({
  projectId: ProjectIdSchema,
  rank: z.number().int().min(1),
  combinedScore: z.number(),
  metaVectorScore: z.number().optional(),
  taxonomyBoost: z.number().optional(),
  relationshipBoost: z.number().optional(),
});
export type DiscoveryResult = z.infer<typeof DiscoveryResultSchema>;

export const DiscoveryAuditSchema = z.object({
  traceId: TraceIdSchema.optional(),
  projectIdsDiscovered: z.array(ProjectIdSchema),
  metaVectorCount: z.number().int().min(0),
  taxonomyCount: z.number().int().min(0),
  relationshipCount: z.number().int().min(0),
  mergeStrategy: z.string(),
});
export type DiscoveryAudit = z.infer<typeof DiscoveryAuditSchema>;

export const DiscoveryOrchestratorOutputSchema = z.object({
  projectIds: z.array(ProjectIdSchema),
  results: z.array(DiscoveryResultSchema),
  audit: DiscoveryAuditSchema,
  explainability: z
    .array(CrossProjectRecommendationExplainabilitySchema)
    .optional(),
  policyDenialRef: z.string().uuid().optional(),
  escalationSignal: EscalationSignalSchema.optional(),
});
export type DiscoveryOrchestratorOutput = z.infer<
  typeof DiscoveryOrchestratorOutputSchema
>;

export const DiscoveryBenchmarkAcceptanceCriteriaSchema = z.object({
  minRelevanceScore: z.number().optional(),
  maxRankTolerance: z.number().int().min(0).optional(),
  requiredProjectOverlap: z.number().min(0).max(1).optional(),
  policyLeakageTolerance: z.literal(0),
});
export type DiscoveryBenchmarkAcceptanceCriteria = z.infer<
  typeof DiscoveryBenchmarkAcceptanceCriteriaSchema
>;

export const PolicyLeakageRegressionFixtureSchema = z.object({
  fixtureId: z.string(),
  requestingProjectId: ProjectIdSchema,
  targetProjectIds: z.array(ProjectIdSchema),
  policyDenies: z.array(ProjectIdSchema),
  expectedAllowedProjectIds: z.array(ProjectIdSchema),
  runAt: z.string().datetime(),
  actualProjectIdsReturned: z.array(ProjectIdSchema),
  passed: z.boolean(),
});
export type PolicyLeakageRegressionFixture = z.infer<
  typeof PolicyLeakageRegressionFixtureSchema
>;

export const DiscoveryBenchmarkFixtureSchema = z.object({
  fixtureId: z.string(),
  queryEmbeddingRef: z.string(),
  expectedProjectRanking: z.array(ProjectIdSchema),
  tolerance: z.number().optional(),
  metaVectorWeights: z.record(z.number()).optional(),
  runAt: z.string().datetime(),
  actualRanking: z.array(ProjectIdSchema),
  passed: z.boolean(),
});
export type DiscoveryBenchmarkFixture = z.infer<
  typeof DiscoveryBenchmarkFixtureSchema
>;
