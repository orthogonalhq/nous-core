/**
 * Phase 8 marketplace governance export contracts for Nous-OSS.
 *
 * Phase 6.4: Explicit schema for Phase 8 intake — discovery and evidence
 * surfaces consumable by registry and package governance layers.
 */
import { z } from 'zod';
import { ProjectIdSchema, TraceIdSchema } from './ids.js';
import { TraceEvidenceReferenceSchema } from './evidence.js';
import {
  DiscoveryResultSchema,
  DiscoveryAuditSchema,
} from './discovery.js';
import { CrossProjectRecommendationExplainabilitySchema } from './explainability.js';

export const Phase8DiscoveryExportSchema = z.object({
  version: z.literal('1.0'),
  exportedAt: z.string().datetime(),
  requestingProjectId: ProjectIdSchema,
  projectIds: z.array(ProjectIdSchema),
  results: z.array(DiscoveryResultSchema),
  audit: DiscoveryAuditSchema,
  explainability: z
    .array(CrossProjectRecommendationExplainabilitySchema)
    .optional(),
});
export type Phase8DiscoveryExport = z.infer<
  typeof Phase8DiscoveryExportSchema
>;

export const Phase8EvidenceExportSchema = z.object({
  version: z.literal('1.0'),
  exportedAt: z.string().datetime(),
  evidenceRefs: z.array(TraceEvidenceReferenceSchema),
  policyDecisionRefs: z.array(z.string().uuid()).optional(),
  traceId: TraceIdSchema.optional(),
});
export type Phase8EvidenceExport = z.infer<typeof Phase8EvidenceExportSchema>;
