/**
 * Artifact domain types for Nous-OSS.
 *
 * Supports the IArtifactStore interface.
 */
import { z } from 'zod';
import {
  ArtifactIdSchema,
  ProjectIdSchema,
  WorkflowDefinitionIdSchema,
  WorkflowDispatchLineageIdSchema,
  WorkflowExecutionIdSchema,
  WorkflowNodeDefinitionIdSchema,
} from './ids.js';

export const ARTIFACT_INTEGRITY_REF_REGEX = /^sha256:[a-f0-9]{64}$/;
export const ARTIFACT_REF_REGEX = /^artifact:\/\/[0-9a-f-]+\/v[1-9][0-9]*$/;

export const ArtifactContentEncodingSchema = z.enum([
  'binary',
  'utf8',
  'base64',
]);
export type ArtifactContentEncoding = z.infer<typeof ArtifactContentEncodingSchema>;

export const ArtifactWriteStateSchema = z.enum([
  'prepared',
  'committed',
]);
export type ArtifactWriteState = z.infer<typeof ArtifactWriteStateSchema>;

export const ArtifactLineageSchema = z.object({
  workflowRunId: WorkflowExecutionIdSchema.optional(),
  workflowDefinitionId: WorkflowDefinitionIdSchema.optional(),
  workflowNodeDefinitionId: WorkflowNodeDefinitionIdSchema.optional(),
  dispatchLineageId: WorkflowDispatchLineageIdSchema.optional(),
  checkpointId: z.string().uuid().optional(),
  triggerId: z.string().uuid().optional(),
  evidenceRefs: z.array(z.string().min(1)).default([]),
});
export type ArtifactLineage = z.infer<typeof ArtifactLineageSchema>;

export const ArtifactWriteRequestSchema = z.object({
  projectId: ProjectIdSchema,
  artifactId: ArtifactIdSchema.optional(),
  name: z.string(),
  mimeType: z.string(),
  data: z.instanceof(Uint8Array).or(z.string()),
  contentEncoding: ArtifactContentEncodingSchema.default('binary'),
  tags: z.array(z.string()).default([]),
  lineage: ArtifactLineageSchema.optional(),
});
export type ArtifactWriteRequest = z.infer<typeof ArtifactWriteRequestSchema>;

export const ArtifactVersionRecordSchema = z.object({
  artifactId: ArtifactIdSchema,
  version: z.number().int().min(1),
  artifactRef: z.string().regex(ARTIFACT_REF_REGEX),
  projectId: ProjectIdSchema,
  name: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().min(0),
  integrityRef: z.string().regex(ARTIFACT_INTEGRITY_REF_REGEX),
  writeState: ArtifactWriteStateSchema,
  lineage: ArtifactLineageSchema.optional(),
  tags: z.array(z.string()),
  createdAt: z.string().datetime(),
  committedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
});
export type ArtifactVersionRecord = z.infer<typeof ArtifactVersionRecordSchema>;

export const ArtifactReadRequestSchema = z.object({
  projectId: ProjectIdSchema,
  artifactId: ArtifactIdSchema,
  version: z.number().int().min(1).optional(),
});
export type ArtifactReadRequest = z.infer<typeof ArtifactReadRequestSchema>;

export const ArtifactDeleteRequestSchema = z.object({
  projectId: ProjectIdSchema,
  artifactId: ArtifactIdSchema,
  version: z.number().int().min(1).optional(),
});
export type ArtifactDeleteRequest = z.infer<typeof ArtifactDeleteRequestSchema>;

export const ArtifactListFilterSchema = z.object({
  mimeType: z.string().optional(),
  tags: z.array(z.string()).optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  workflowRunId: WorkflowExecutionIdSchema.optional(),
  workflowNodeDefinitionId: WorkflowNodeDefinitionIdSchema.optional(),
  checkpointId: z.string().uuid().optional(),
  includeAllVersions: z.boolean().default(false),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().min(0).optional(),
});
export type ArtifactListFilter = z.infer<typeof ArtifactListFilterSchema>;

export const ArtifactWriteResultSchema = z.object({
  artifactId: ArtifactIdSchema,
  version: z.number().int().min(1),
  artifactRef: z.string().regex(ARTIFACT_REF_REGEX),
  integrityRef: z.string().regex(ARTIFACT_INTEGRITY_REF_REGEX),
  committed: z.boolean(),
});
export type ArtifactWriteResult = z.infer<typeof ArtifactWriteResultSchema>;

export const ArtifactReadResultSchema = ArtifactVersionRecordSchema.extend({
  data: z.instanceof(Uint8Array).or(z.string()),
  contentEncoding: ArtifactContentEncodingSchema,
});
export type ArtifactReadResult = z.infer<typeof ArtifactReadResultSchema>;

// Backward-compatible aliases for earlier placeholder names.
export const ArtifactMetadataSchema = ArtifactVersionRecordSchema;
export type ArtifactMetadata = ArtifactVersionRecord;

export const ArtifactDataSchema = ArtifactReadResultSchema;
export type ArtifactData = ArtifactReadResult;

export const ArtifactFilterSchema = ArtifactListFilterSchema;
export type ArtifactFilter = ArtifactListFilter;
