/**
 * Topic taxonomy types for Nous-OSS.
 *
 * Phase 6.2: Structural tags linking related domains.
 * Project-to-taxonomy mapping semantics.
 */
import { z } from 'zod';
import { ProjectIdSchema } from './ids.js';

export const TaxonomyTagSchema = z.string().min(1).max(128);
export type TaxonomyTag = z.infer<typeof TaxonomyTagSchema>;

export const TaxonomyTagMetadataSchema = z
  .object({
    description: z.string().optional(),
    parentTag: TaxonomyTagSchema.optional(),
    addedAt: z.string().datetime(),
  })
  .optional();
export type TaxonomyTagMetadata = z.infer<typeof TaxonomyTagMetadataSchema>;

export const ProjectTaxonomyMappingSchema = z.object({
  projectId: ProjectIdSchema,
  tags: z.array(TaxonomyTagSchema),
  updatedAt: z.string().datetime(),
});
export type ProjectTaxonomyMapping = z.infer<
  typeof ProjectTaxonomyMappingSchema
>;
