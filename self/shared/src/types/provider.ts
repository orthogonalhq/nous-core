/**
 * Provider domain types for Nous-OSS.
 *
 * Derived from project-model.mdx "Heterogeneous Provider Model".
 * Covers model provider configuration, requests, responses, and streaming chunks.
 */
import { z } from 'zod';
import { ProviderIdSchema, ProjectIdSchema, TraceIdSchema } from './ids.js';
import { ProviderTypeSchema, ModelRoleSchema } from './enums.js';

// --- Provider Class (Phase 2.3) ---
export const ProviderClassSchema = z.enum(['local_text', 'remote_text']);
export type ProviderClass = z.infer<typeof ProviderClassSchema>;

// --- Provider Vendor (WR-138) ---
// The known baseline vendor keys match the current `ADAPTER_REGISTRY` entries in
// `@nous/cortex-core/src/agent-gateway/adapters/index.ts` (plus `'text'` for the
// fall-through adapter). The schema is INTENTIONALLY an open string (`z.string().min(1)`,
// NOT `z.enum([...])`) so new vendors can be added purely in `@nous/cortex-core`
// without a breaking change to `@nous/shared`. See:
//   - `.architecture/.decisions/2026-04-08-provider-type-plumbing/provider-vendor-field-v1.md` §§ 1-6, AC #1-#9
export const KNOWN_PROVIDER_VENDORS = ['anthropic', 'openai', 'ollama', 'text'] as const;
export type KnownProviderVendor = (typeof KNOWN_PROVIDER_VENDORS)[number];
export type ProviderVendor = KnownProviderVendor | (string & {});

export const ProviderVendorSchema = z
  .string()
  .min(1)
  .describe(
    'Provider vendor key for adapter selection. Known values: ' +
      KNOWN_PROVIDER_VENDORS.join(', ') +
      '. Unknown values fall back to the text adapter.',
  );

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
  providerClass: ProviderClassSchema.optional(),
  meetsProfiles: z.array(z.string()).optional(),
  vendor: ProviderVendorSchema.optional(),
});
export type ModelProviderConfig = z.infer<typeof ModelProviderConfigSchema>;

export const ModelRequestAgentClassSchema = z.enum([
  'Cortex::Principal',
  'Cortex::System',
  'Orchestrator',
  'Worker',
]);
export type ModelRequestAgentClass = z.infer<typeof ModelRequestAgentClassSchema>;

const AbortSignalSchema = z.custom<AbortSignal>(
  (value) => typeof AbortSignal !== 'undefined' && value instanceof AbortSignal,
  'Expected AbortSignal',
);

// --- Model Request ---
export const ModelRequestSchema = z.object({
  role: ModelRoleSchema,
  input: z.unknown(),
  projectId: ProjectIdSchema.optional(),
  traceId: TraceIdSchema,
  agentClass: ModelRequestAgentClassSchema.optional(),
  abortSignal: AbortSignalSchema.optional(),
  correlationRunId: z.string().optional(),
  correlationParentId: z.string().optional(),
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
