/**
 * Project meta-vector types for Nous-OSS.
 *
 * Phase 6.2: One embedding per project summarizing its domain.
 * Provenance linkage to distilled patterns.
 */
import { z } from 'zod';
import { MemoryEntryIdSchema, ProjectIdSchema } from './ids.js';

export const ProjectMetaVectorSchema = z.object({
  projectId: ProjectIdSchema,
  vector: z.array(z.number()).min(1),
  basedOn: z.array(MemoryEntryIdSchema),
  updatedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});
export type ProjectMetaVector = z.infer<typeof ProjectMetaVectorSchema>;

export const MetaVectorSearchResultSchema = z.object({
  projectId: ProjectIdSchema,
  similarity: z.number(),
  rank: z.number().int().min(1),
});
export type MetaVectorSearchResult = z.infer<
  typeof MetaVectorSearchResultSchema
>;
