/**
 * Cross-project relevance benchmark types for Nous-OSS.
 *
 * Phase 6.2: Regression contract for meta-vector and taxonomy quality.
 */
import { z } from 'zod';
import { ProjectIdSchema } from './ids.js';

export const CrossProjectRelevanceBenchmarkSchema = z.object({
  benchmarkId: z.string(),
  queryEmbeddingRef: z.string(),
  expectedProjectRanking: z.array(ProjectIdSchema),
  tolerance: z.number().optional(),
  runAt: z.string().datetime(),
  actualRanking: z.array(ProjectIdSchema),
  passed: z.boolean(),
});
export type CrossProjectRelevanceBenchmark = z.infer<
  typeof CrossProjectRelevanceBenchmarkSchema
>;
