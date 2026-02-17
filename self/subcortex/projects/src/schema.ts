/**
 * ProjectDocumentSchema — Stored project shape with status for archive filtering.
 */
import { z } from 'zod';
import { ProjectConfigSchema } from '@nous/shared';

export const ProjectDocumentSchema = ProjectConfigSchema.extend({
  status: z.enum(['active', 'archived']),
});
export type ProjectDocument = z.infer<typeof ProjectDocumentSchema>;
