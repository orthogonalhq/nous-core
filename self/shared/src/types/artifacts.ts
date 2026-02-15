/**
 * Artifact domain types for Nous-OSS.
 *
 * Supports the IArtifactStore interface.
 */
import { z } from 'zod';
import { ArtifactIdSchema, ProjectIdSchema, NodeIdSchema } from './ids.js';

// --- Artifact Metadata ---
// Metadata without binary content — for listing.
export const ArtifactMetadataSchema = z.object({
  id: ArtifactIdSchema,
  projectId: ProjectIdSchema,
  name: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().min(0),
  version: z.number().int().min(1),
  producedByNodeId: NodeIdSchema.optional(),
  tags: z.array(z.string()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ArtifactMetadata = z.infer<typeof ArtifactMetadataSchema>;

// --- Artifact Data ---
// Full artifact including content reference.
export const ArtifactDataSchema = ArtifactMetadataSchema.extend({
  data: z.instanceof(Uint8Array).or(z.string()),
});
export type ArtifactData = z.infer<typeof ArtifactDataSchema>;

// --- Artifact Filter ---
// Filter for listing artifacts.
export const ArtifactFilterSchema = z.object({
  mimeType: z.string().optional(),
  tags: z.array(z.string()).optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().min(0).optional(),
});
export type ArtifactFilter = z.infer<typeof ArtifactFilterSchema>;
