/**
 * Provider domain types for Nous-OSS.
 *
 * Derived from project-model.mdx "Heterogeneous Provider Model".
 * Covers model provider configuration, requests, responses, and streaming chunks.
 */
import { z } from 'zod';
import { ProviderIdSchema, ProjectIdSchema, TraceIdSchema } from './ids.js';
import { ProviderTypeSchema, ModelRoleSchema } from './enums.js';

// --- Model Provider Configuration ---
export const ModelProviderConfigSchema = z.object({
  id: ProviderIdSchema,
  name: z.string(),
  type: ProviderTypeSchema,
  endpoint: z.string().url().optional(),
  modelId: z.string(),
  isLocal: z.boolean(),
  maxTokens: z.number().positive().optional(),
  capabilities: z.array(z.string()),
});
export type ModelProviderConfig = z.infer<typeof ModelProviderConfigSchema>;

// --- Model Request ---
export const ModelRequestSchema = z.object({
  role: ModelRoleSchema,
  input: z.unknown(),
  projectId: ProjectIdSchema.optional(),
  traceId: TraceIdSchema,
});
export type ModelRequest = z.infer<typeof ModelRequestSchema>;

// --- Model Response ---
export const ModelResponseSchema = z.object({
  output: z.unknown(),
  providerId: ProviderIdSchema,
  usage: z.object({
    inputTokens: z.number().int().min(0).optional(),
    outputTokens: z.number().int().min(0).optional(),
    computeMs: z.number().min(0).optional(),
  }),
  traceId: TraceIdSchema,
});
export type ModelResponse = z.infer<typeof ModelResponseSchema>;

// --- Model Stream Chunk ---
// A single chunk from a streaming model response.
export const ModelStreamChunkSchema = z.object({
  content: z.string(),
  done: z.boolean(),
  usage: z
    .object({
      inputTokens: z.number().int().min(0).optional(),
      outputTokens: z.number().int().min(0).optional(),
    })
    .optional(),
});
export type ModelStreamChunk = z.infer<typeof ModelStreamChunkSchema>;
