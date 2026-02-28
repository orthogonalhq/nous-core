/**
 * Relationship graph types for Nous-OSS.
 *
 * Phase 6.3: Background relationship mapping between projects.
 * Provenance linkage to source patterns and evidence (Phase 4.4).
 */
import { z } from 'zod';
import {
  MemoryEntryIdSchema,
  ProjectIdSchema,
  TraceIdSchema,
} from './ids.js';
import { TraceEvidenceReferenceSchema } from './evidence.js';
import { Phase6DistilledPatternExportSchema } from './confidence-governance.js';

export const RelationshipEdgeTypeSchema = z.enum([
  'thematic', // shared domain/topic
  'causal', // one project's knowledge informs another
  'structural', // taxonomy or hierarchy link
]);
export type RelationshipEdgeType = z.infer<typeof RelationshipEdgeTypeSchema>;

export const RelationshipEdgeSchema = z.object({
  id: z.string().uuid(),
  sourceProjectId: ProjectIdSchema,
  targetProjectId: ProjectIdSchema,
  strength: z.number().min(0).max(1),
  type: RelationshipEdgeTypeSchema,
  evidenceRefs: z.array(TraceEvidenceReferenceSchema),
  sourcePatternIds: z.array(MemoryEntryIdSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type RelationshipEdge = z.infer<typeof RelationshipEdgeSchema>;

export const RelationshipMappingInputSchema = z.object({
  projectId: ProjectIdSchema,
  patterns: z.array(Phase6DistilledPatternExportSchema),
  traceId: TraceIdSchema.optional(),
});
export type RelationshipMappingInput = z.infer<
  typeof RelationshipMappingInputSchema
>;

export const RelationshipMappingOutputSchema = z.object({
  projectId: ProjectIdSchema,
  edgesCreated: z.number().int().min(0),
  edgesUpdated: z.number().int().min(0),
  edgesInvalidated: z.number().int().min(0),
  evidenceRefs: z.array(TraceEvidenceReferenceSchema),
});
export type RelationshipMappingOutput = z.infer<
  typeof RelationshipMappingOutputSchema
>;
