/**
 * Ollama tRPC router — model lifecycle management (list, pull, delete).
 *
 * Proxies to the local Ollama HTTP API (localhost:11434).
 * Pull progress is emitted via the event bus on the 'ollama:pull-progress'
 * SSE channel so the UI can display live progress.
 */
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { pullOllamaModel, deleteOllamaModel } from '../../ollama-detection';

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';
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
  listModels: publicProcedure.query(async () => {
    try {
      const response = await fetch(`${DEFAULT_OLLAMA_BASE_URL}/api/tags`, {
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
      console.log(`[nous:ollama] pullModel: started ${input.model}`);

      try {
        await pullOllamaModel(input.model, {
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
    .mutation(async ({ input }) => {
      console.log(`[nous:ollama] deleteModel: deleting ${input.name}`);

      try {
        await deleteOllamaModel(input.name);
        console.log(`[nous:ollama] deleteModel: deleted ${input.name}`);
        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`[nous:ollama] deleteModel: failed ${input.name} — ${message}`);
        throw err;
      }
    }),
});
