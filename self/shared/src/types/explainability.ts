/**
 * Cross-project recommendation explainability types for Nous-OSS.
 *
 * Phase 6.4: Trace linkage for discovery results; which pattern, meta-vector,
 * or relationship influenced which outcome.
 */
import { z } from 'zod';
import { MemoryEntryIdSchema, ProjectIdSchema } from './ids.js';
import { TraceEvidenceReferenceSchema } from './evidence.js';

export const CrossProjectRecommendationExplainabilitySchema = z.object({
  resultIndex: z.number().int().min(0),
  projectId: ProjectIdSchema,
  influencingSource: z.enum([
    'meta_vector',
    'taxonomy',
    'relationship',
    'combined',
  ]),
  patternRefs: z.array(MemoryEntryIdSchema).optional(),
  metaVectorScore: z.number().optional(),
  taxonomyTags: z.array(z.string()).optional(),
  relationshipEdgeIds: z.array(z.string().uuid()).optional(),
  evidenceRefs: z.array(TraceEvidenceReferenceSchema).min(1),
  policyDecisionRef: z.string().uuid().optional(),
  controlStateRef: z.string().optional(),
});
export type CrossProjectRecommendationExplainability = z.infer<
  typeof CrossProjectRecommendationExplainabilitySchema
>;
