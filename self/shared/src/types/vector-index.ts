/**
 * Vector indexing and embedding provenance contracts for Nous-OSS.
 *
 * Phase 8.1: Runtime foundation for deterministic embedding generation,
 * vector persistence metadata, and evidence-linkable indexing records.
 */
import { z } from 'zod';
import {
  ProjectIdSchema,
  MemoryEntryIdSchema,
  TraceIdSchema,
} from './ids.js';
import { MemoryTypeSchema, MemoryScopeSchema } from './enums.js';
import { TraceEvidenceReferenceSchema } from './evidence.js';

export const EmbeddingProviderSchema = z.enum([
  'local',
  'remote',
  'wasm',
  'test',
]);
export type EmbeddingProvider = z.infer<typeof EmbeddingProviderSchema>;

export const EmbeddingModelProvenanceSchema = z.object({
  modelId: z.string().min(1),
  modelVersion: z.string().min(1),
  modelHash: z.string().regex(/^[a-f0-9]{64}$/),
  provider: EmbeddingProviderSchema,
  dimensions: z.number().int().positive(),
});
export type EmbeddingModelProvenance = z.infer<
  typeof EmbeddingModelProvenanceSchema
>;

export const EmbeddingGenerationRecordSchema = z.object({
  requestId: z.string().uuid(),
  generatedAt: z.string().datetime(),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  profile: EmbeddingModelProvenanceSchema,
});
export type EmbeddingGenerationRecord = z.infer<
  typeof EmbeddingGenerationRecordSchema
>;

export const VectorIndexMetadataSchema = z.object({
  memoryEntryId: MemoryEntryIdSchema,
  memoryType: MemoryTypeSchema,
  scope: MemoryScopeSchema,
  projectId: ProjectIdSchema.optional(),
  traceId: TraceIdSchema,
  evidenceRefs: z.array(TraceEvidenceReferenceSchema).min(1),
  tokenEstimate: z.number().int().nonnegative(),
  embedding: EmbeddingGenerationRecordSchema,
});
export type VectorIndexMetadata = z.infer<typeof VectorIndexMetadataSchema>;

export const VectorIndexRequestSchema = z.object({
  collection: z.string().min(1),
  content: z.string().min(1),
  metadata: z.object({
    memoryEntryId: MemoryEntryIdSchema,
    memoryType: MemoryTypeSchema,
    scope: MemoryScopeSchema,
    projectId: ProjectIdSchema.optional(),
    traceId: TraceIdSchema,
    evidenceRefs: z.array(TraceEvidenceReferenceSchema).min(1),
  }),
});
export type VectorIndexRequest = z.infer<typeof VectorIndexRequestSchema>;

export const VectorIndexResultSchema = z.object({
  indexed: z.boolean(),
  vectorId: z.string().min(1),
  tokenEstimate: z.number().int().nonnegative(),
  generatedAt: z.string().datetime(),
});
export type VectorIndexResult = z.infer<typeof VectorIndexResultSchema>;

