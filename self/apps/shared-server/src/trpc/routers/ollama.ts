/**
 * Ollama tRPC router — model lifecycle management (list, pull, delete)
 * and endpoint configuration (get, set).
 *
 * Proxies to the local Ollama HTTP API. The base URL is read from the
 * provider config via getOllamaEndpointFromContext(), falling back to
 * http://localhost:11434 when no custom endpoint is configured.
 *
 * Pull progress is emitted via the event bus on the 'ollama:pull-progress'
 * SSE channel so the UI can display live progress.
 */
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { pullOllamaModel, deleteOllamaModel } from '../../ollama-detection';
import { getOllamaEndpointFromContext, DEFAULT_OLLAMA_BASE_URL } from '../../ollama-config';
import { OLLAMA_WELL_KNOWN_PROVIDER_ID, buildOllamaProviderConfig, upsertProviderConfig } from '../../bootstrap';
import type { ModelProviderConfig } from '@nous/shared';

const OLLAMA_LIST_TIMEOUT_MS = 5000;

/**
 * Richer schema for Ollama /api/tags response — includes size and modified_at
 * that the existing OllamaTagsResponseSchema (ollama-detection.ts) omits.
 */
const OllamaTagsRichResponseSchema = z.object({
  models: z
    .array(
      z.object({
        name: z.string(),
        size: z.number(),
        modified_at: z.string(),
      }),
    )
    .optional()
    .default([]),
});

export const ollamaRouter = router({
  /**
   * List installed Ollama models with size and modification date.
   */
  listModels: publicProcedure.query(async ({ ctx }) => {
    const endpoint = getOllamaEndpointFromContext(ctx);
    console.log(`[nous:ollama] listModels: using endpoint ${endpoint}`);
    try {
      const response = await fetch(`${endpoint}/api/tags`, {
        signal: AbortSignal.timeout(OLLAMA_LIST_TIMEOUT_MS),
      });

      if (!response.ok) {
        console.log('[nous:ollama] listModels: Ollama returned non-OK status', response.status);
        return { models: [] };
      }

      const body = await response.json();
      const parsed = OllamaTagsRichResponseSchema.safeParse(body);

      if (!parsed.success) {
        console.log('[nous:ollama] listModels: failed to parse response', parsed.error.message);
        return { models: [] };
      }

      const models = parsed.data.models.map((m) => ({
        name: m.name,
        size: m.size,
        modifiedAt: m.modified_at,
      }));

      console.log(`[nous:ollama] listModels: found ${models.length} models`);
      return { models };
    } catch {
      // Ollama not reachable
      return { models: [] };
    }
  }),

  /**
   * Pull (download) an Ollama model. Emits progress events via the event bus.
   *
   * Input uses `{ model: string }` to match Ollama's pull API convention,
   * whereas deleteModel uses `{ name: string }` to match Ollama's delete API.
   */
  pullModel: publicProcedure
    .input(z.object({ model: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const endpoint = getOllamaEndpointFromContext(ctx);
      console.log(`[nous:ollama] pullModel: started ${input.model}`);

      try {
        await pullOllamaModel(input.model, {
          baseUrl: endpoint,
          onProgress: (progress) => {
            ctx.eventBus.publish('ollama:pull-progress', {
              model: input.model,
              status: progress.status,
              digest: progress.digest,
              total: progress.total,
              completed: progress.completed,
              percent: progress.percent,
            });
          },
        });

        console.log(`[nous:ollama] pullModel: completed ${input.model}`);
        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`[nous:ollama] pullModel: failed ${input.model} — ${message}`);
        throw err;
      }
    }),

  /**
   * Delete an installed Ollama model.
   *
   * Input uses `{ name: string }` to match Ollama's delete API convention.
   */
  deleteModel: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const endpoint = getOllamaEndpointFromContext(ctx);
      console.log(`[nous:ollama] deleteModel: deleting ${input.name}`);

      try {
        await deleteOllamaModel(input.name, { baseUrl: endpoint });
        console.log(`[nous:ollama] deleteModel: deleted ${input.name}`);
        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`[nous:ollama] deleteModel: failed ${input.name} — ${message}`);
        throw err;
      }
    }),

  /**
   * Get the currently configured Ollama endpoint (or default).
   */
  getEndpoint: publicProcedure.query(async ({ ctx }) => {
    const endpoint = getOllamaEndpointFromContext(ctx);
    return { endpoint };
  }),

  /**
   * Set (or reset) the Ollama endpoint.
   *
   * Pass a valid URL string to set a custom endpoint, or `null` to reset
   * to the default (http://localhost:11434).
   */
  setEndpoint: publicProcedure
    .input(z.object({ endpoint: z.string().url().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const config = ctx.config.get() as {
        providers?: Array<{ id?: string; endpoint?: string; isLocal?: boolean; modelId?: string }>;
      };
      const existingProvider = config.providers?.find(
        (p) => p.id === OLLAMA_WELL_KNOWN_PROVIDER_ID || p.isLocal,
      );

      // Build the provider config with the new (or cleared) endpoint
      const endpointValue = input.endpoint ?? undefined;
      const baseConfig = existingProvider
        ? {
            ...buildOllamaProviderConfig(existingProvider.modelId ?? 'unknown'),
            ...existingProvider,
            endpoint: endpointValue ?? DEFAULT_OLLAMA_BASE_URL,
          }
        : {
            ...buildOllamaProviderConfig('unknown'),
            endpoint: endpointValue ?? DEFAULT_OLLAMA_BASE_URL,
          };

      await upsertProviderConfig(ctx, baseConfig as ModelProviderConfig);

      const effectiveEndpoint = endpointValue ?? DEFAULT_OLLAMA_BASE_URL;
      console.log(`[nous:ollama] endpoint configured: ${effectiveEndpoint}`);
      return { success: true };
    }),
});
