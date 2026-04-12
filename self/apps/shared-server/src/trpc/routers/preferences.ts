/**
 * Preferences tRPC router — API key management, system status, and model selection.
 */
import { z } from 'zod';
import { ModelRoleSchema, type ModelRole, type ProviderId } from '@nous/shared';
import type { NousContext } from '../../context';
import { router, publicProcedure } from '../trpc';
import { detectOllama } from '../../ollama-detection';
import {
  OLLAMA_WELL_KNOWN_PROVIDER_ID,
  WELL_KNOWN_PROVIDER_IDS,
  buildOllamaProviderConfig,
  buildProviderConfig,
  currentRoleAssignment,
  parseSelectedModelSpec,
  registerConfiguredProvider,
  removeConfiguredProvider,
  updateRoleAssignment,
  upsertProviderConfig,
} from '../../bootstrap';

const SYSTEM_APP_ID = 'nous:system';

const ProviderSchema = z.enum(['anthropic', 'openai']);
type Provider = z.infer<typeof ProviderSchema>;

type AvailableModel = {
  id: string;
  name: string;
  provider: string;
  available: boolean;
};

type CachedModelList = {
  models: AvailableModel[];
  fetchedAt: number;
};

type CloudModelFetchResult = {
  models: AvailableModel[];
  cacheable: boolean;
};

const CLOUD_PROVIDERS: Provider[] = ['anthropic', 'openai'];
const MODEL_ROLES = [...ModelRoleSchema.options] as ModelRole[];
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;
const modelCache = new Map<Provider, CachedModelList>();

type RoleAssignmentSummary = {
  providerId: ProviderId;
  fallbackProviderId?: ProviderId;
};

const AnthropicModelSchema = z.object({
  id: z.string(),
  display_name: z.string(),
  type: z.string(),
});

const AnthropicModelsResponseSchema = z.object({
  data: z.array(AnthropicModelSchema),
  has_more: z.boolean().optional(),
  first_id: z.string().optional(),
  last_id: z.string().optional(),
});

const OpenAIModelSchema = z.object({
  id: z.string(),
  object: z.string(),
  owned_by: z.string(),
});

const OpenAIModelsResponseSchema = z.object({
  data: z.array(OpenAIModelSchema),
  object: z.string(),
});

const ANTHROPIC_FALLBACK_MODELS: AvailableModel[] = [
  {
    id: 'anthropic:claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4 (cached)',
    provider: 'anthropic',
    available: false,
  },
  {
    id: 'anthropic:claude-opus-4-20250514',
    name: 'Claude Opus 4 (cached)',
    provider: 'anthropic',
    available: false,
  },
];

const OPENAI_FALLBACK_MODELS: AvailableModel[] = [
  {
    id: 'openai:gpt-4o',
    name: 'GPT-4o (cached)',
    provider: 'openai',
    available: false,
  },
];

const OPENAI_CHAT_MODEL_PREFIXES = ['gpt-4o', 'gpt-4', 'o1', 'o3', 'o4'];

const PROVIDER_CONFIG: Record<
  Provider,
  {
    envVar: string;
    targetHost: string;
    injectionKey: string;
  }
> = {
  anthropic: {
    envVar: 'ANTHROPIC_API_KEY',
    targetHost: 'api.anthropic.com',
    injectionKey: 'x-api-key',
  },
  openai: {
    envVar: 'OPENAI_API_KEY',
    targetHost: 'api.openai.com',
    injectionKey: 'Authorization',
  },
};

function vaultKey(provider: Provider): string {
  return `api_key_${provider}`;
}

function maskApiKey(key: string): string {
  if (key.length <= 11) {
    return key.slice(0, 3) + '...' + key.slice(-4);
  }
  return key.slice(0, 7) + '...' + key.slice(-4);
}

function cloneModels(models: AvailableModel[]): AvailableModel[] {
  return models.map((model) => ({ ...model }));
}

function buildProviderSelection(
  selectedModel: NonNullable<ReturnType<typeof parseSelectedModelSpec>>,
) {
  if (selectedModel.provider === 'ollama') {
    return {
      providerId: OLLAMA_WELL_KNOWN_PROVIDER_ID,
      providerConfig: buildOllamaProviderConfig(
        selectedModel.modelId,
        OLLAMA_WELL_KNOWN_PROVIDER_ID,
      ),
    };
  }

  const providerId = WELL_KNOWN_PROVIDER_IDS[selectedModel.provider];
  return {
    providerId,
    providerConfig: buildProviderConfig(
      selectedModel.provider,
      providerId,
      selectedModel.modelId,
    ),
  };
}

function isOpenAIChatModel(modelId: string): boolean {
  return OPENAI_CHAT_MODEL_PREFIXES.some((prefix) => modelId.startsWith(prefix));
}

function getCachedModels(provider: Provider): AvailableModel[] | null {
  const cached = modelCache.get(provider);
  if (!cached) {
    return null;
  }

  const ageMs = Date.now() - cached.fetchedAt;
  if (ageMs >= MODEL_CACHE_TTL_MS) {
    return null;
  }

  console.debug(
    `[nous:preferences] Using cached ${provider} model list (age: ${Math.floor(ageMs / 1000)}s)`,
  );
  return cloneModels(cached.models);
}

async function fetchAnthropicModels(
  apiKey: string,
): Promise<CloudModelFetchResult> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/models', {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    });

    if (!response.ok) {
      console.warn(
        `[nous:preferences] Failed to fetch anthropic models: HTTP ${response.status}. Using fallback list.`,
      );
      return {
        models: cloneModels(ANTHROPIC_FALLBACK_MODELS),
        cacheable: false,
      };
    }

    const parsed = AnthropicModelsResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      console.warn(
        '[nous:preferences] Failed to parse anthropic /v1/models response. Using fallback list.',
      );
      return {
        models: cloneModels(ANTHROPIC_FALLBACK_MODELS),
        cacheable: false,
      };
    }

    if (parsed.data.has_more) {
      console.warn(
        '[nous:preferences] Anthropic /v1/models has_more=true - some models may not be listed',
      );
    }

    const models = parsed.data.data.map((model) => ({
      id: `anthropic:${model.id}`,
      name: model.display_name,
      provider: 'anthropic',
      available: true,
    }));

    console.info(
      `[nous:preferences] Fetched ${models.length} models from anthropic /v1/models`,
    );

    return { models, cacheable: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[nous:preferences] Network error fetching anthropic models: ${message}. Using fallback list.`,
    );
    return {
      models: cloneModels(ANTHROPIC_FALLBACK_MODELS),
      cacheable: false,
    };
  }
}

async function fetchOpenAIModels(apiKey: string): Promise<CloudModelFetchResult> {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      console.warn(
        `[nous:preferences] Failed to fetch openai models: HTTP ${response.status}. Using fallback list.`,
      );
      return {
        models: cloneModels(OPENAI_FALLBACK_MODELS),
        cacheable: false,
      };
    }

    const parsed = OpenAIModelsResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      console.warn(
        '[nous:preferences] Failed to parse openai /v1/models response. Using fallback list.',
      );
      return {
        models: cloneModels(OPENAI_FALLBACK_MODELS),
        cacheable: false,
      };
    }

    const models = parsed.data.data
      .filter((model) => isOpenAIChatModel(model.id))
      .map((model) => ({
        id: `openai:${model.id}`,
        name: model.id,
        provider: 'openai',
        available: true,
      }));

    console.info(
      `[nous:preferences] Fetched ${models.length} models from openai /v1/models`,
    );

    return { models, cacheable: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[nous:preferences] Network error fetching openai models: ${message}. Using fallback list.`,
    );
    return {
      models: cloneModels(OPENAI_FALLBACK_MODELS),
      cacheable: false,
    };
  }
}

async function getCloudModelsForProvider(
  ctx: NousContext,
  provider: Provider,
): Promise<AvailableModel[]> {
  try {
    const resolved = await ctx.credentialVaultService.resolveForInjection(
      SYSTEM_APP_ID,
      vaultKey(provider),
    );

    if (!resolved?.secretValue) {
      console.debug(
        `[nous:preferences] Skipping ${provider} model fetch - no API key configured`,
      );
      return [];
    }

    const cachedModels = getCachedModels(provider);
    if (cachedModels) {
      return cachedModels;
    }

    const result =
      provider === 'anthropic'
        ? await fetchAnthropicModels(resolved.secretValue)
        : await fetchOpenAIModels(resolved.secretValue);

    if (result.cacheable) {
      modelCache.set(provider, {
        models: cloneModels(result.models),
        fetchedAt: Date.now(),
      });
    }

    return cloneModels(result.models);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[nous:preferences] Failed to resolve ${provider} API key: ${message}. Skipping provider.`,
    );
    return [];
  }
}

export const preferencesRouter = router({
  getApiKeys: publicProcedure.query(async ({ ctx }) => {
    const providers: Provider[] = ['anthropic', 'openai'];
    const results: Array<{
      provider: Provider;
      configured: boolean;
      maskedKey: string | null;
      createdAt: string | null;
    }> = [];

    for (const provider of providers) {
      const metadata = await ctx.credentialVaultService.getMetadata(
        SYSTEM_APP_ID,
        vaultKey(provider),
      );

      if (metadata) {
        // Resolve the secret to produce a masked value
        const resolved = await ctx.credentialVaultService.resolveForInjection(
          SYSTEM_APP_ID,
          vaultKey(provider),
        );

        results.push({
          provider,
          configured: true,
          maskedKey: resolved ? maskApiKey(resolved.secretValue) : null,
          createdAt: metadata.created_at,
        });
      } else {
        results.push({
          provider,
          configured: false,
          maskedKey: null,
          createdAt: null,
        });
      }
    }

    return results;
  }),

  setApiKey: publicProcedure
    .input(
      z.object({
        provider: ProviderSchema,
        key: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const config = PROVIDER_CONFIG[input.provider];

      await ctx.credentialVaultService.store(SYSTEM_APP_ID, {
        key: vaultKey(input.provider),
        value: input.key,
        credential_type: 'api_key',
        target_host: config.targetHost,
        injection_location: 'header',
        injection_key: config.injectionKey,
      });

      // Set in process environment for immediate SDK access
      process.env[config.envVar] = input.key;
      await registerConfiguredProvider(ctx, input.provider);
      console.log(
        `[nous:preferences] setApiKey: registered provider ${input.provider}`,
      );

      return { stored: true };
    }),

  deleteApiKey: publicProcedure
    .input(
      z.object({
        provider: ProviderSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const config = PROVIDER_CONFIG[input.provider];

      const result = await ctx.credentialVaultService.revoke(SYSTEM_APP_ID, {
        key: vaultKey(input.provider),
        reason: 'user_deleted',
      });

      // Clear from process environment
      delete process.env[config.envVar];
      await removeConfiguredProvider(ctx, input.provider);
      console.log(
        `[nous:preferences] deleteApiKey: removed provider ${input.provider}`,
      );

      return { deleted: result.revoked };
    }),

  testApiKey: publicProcedure
    .input(
      z.object({
        provider: ProviderSchema,
        key: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const resolvedKey =
          input.key ??
          (
            await ctx.credentialVaultService.resolveForInjection(
              SYSTEM_APP_ID,
              vaultKey(input.provider),
            )
          )?.secretValue;

        if (!resolvedKey) {
          return {
            valid: false,
            error: 'No API key configured for this provider. Store a key first.',
          };
        }

        if (input.provider === 'anthropic') {
          const response = await fetch('https://api.anthropic.com/v1/models', {
            method: 'GET',
            headers: {
              'x-api-key': resolvedKey,
              'anthropic-version': '2023-06-01',
            },
          });
          if (response.ok) {
            return { valid: true, error: null };
          }
          const body = await response.text();
          return { valid: false, error: `HTTP ${response.status}: ${body.slice(0, 200)}` };
        }

        if (input.provider === 'openai') {
          const response = await fetch('https://api.openai.com/v1/models', {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${resolvedKey}`,
            },
          });
          if (response.ok) {
            return { valid: true, error: null };
          }
          const body = await response.text();
          return { valid: false, error: `HTTP ${response.status}: ${body.slice(0, 200)}` };
        }

        return { valid: false, error: `Unknown provider: ${input.provider}` };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { valid: false, error: message };
      }
    }),

  getAvailableModels: publicProcedure.query(async ({ ctx }) => {
    // Get Ollama models
    const ollamaStatus = await detectOllama();
    const ollamaModels = ollamaStatus.models.map((m) => ({
      id: `ollama:${m}`,
      name: m,
      provider: 'ollama' as const,
      available: ollamaStatus.running,
    }));

    // Get cloud models from the provider APIs
    const cloudModelResults = await Promise.all(
      CLOUD_PROVIDERS.map((provider) => getCloudModelsForProvider(ctx, provider)),
    );
    const cloudModels = cloudModelResults.flat();

    return { models: [...ollamaModels, ...cloudModels] };
  }),

  getRoleAssignments: publicProcedure.query(async ({ ctx }) => {
    return Object.fromEntries(
      MODEL_ROLES.map((role) => {
        const assignment = currentRoleAssignment(ctx, role);
        const value: RoleAssignmentSummary | null = assignment
          ? {
              providerId: assignment.providerId,
              ...(assignment.fallbackProviderId
                ? { fallbackProviderId: assignment.fallbackProviderId }
                : {}),
            }
          : null;

        return [role, value];
      }),
    ) as Record<ModelRole, RoleAssignmentSummary | null>;
  }),

  setRoleAssignment: publicProcedure
    .input(
      z.object({
        role: ModelRoleSchema,
        modelSpec: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const selectedModel = parseSelectedModelSpec(input.modelSpec);
      if (!selectedModel) {
        const error = `Cannot parse model spec: ${input.modelSpec}`;
        console.warn(`[nous:preferences] ${error}. Skipping role assignment update.`);
        return { success: false, error };
      }

      try {
        const { providerId, providerConfig } = buildProviderSelection(selectedModel);

        await upsertProviderConfig(ctx, providerConfig);
        await updateRoleAssignment(ctx, input.role, providerId);

        console.info(
          `[nous:preferences] Updated ${input.role} assignment to ${input.modelSpec}`,
        );
        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[nous:preferences] Failed to update ${input.role} assignment: ${message}`,
        );
        return { success: false, error: message };
      }
    }),

  getSystemStatus: publicProcedure.query(async ({ ctx }) => {
    // Determine which providers are configured
    const providers = CLOUD_PROVIDERS;
    const configuredProviders: string[] = [];

    for (const provider of providers) {
      const metadata = await ctx.credentialVaultService.getMetadata(
        SYSTEM_APP_ID,
        vaultKey(provider),
      );
      if (metadata) {
        configuredProviders.push(provider);
      }
    }

    // Check Ollama status
    let ollamaRunning = false;
    let ollamaModels: string[] = [];
    try {
      const response = await fetch('http://127.0.0.1:11434/api/tags', {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        ollamaRunning = true;
        const body = (await response.json()) as { models?: Array<{ name: string }> };
        ollamaModels = body.models?.map((m) => m.name) ?? [];
      }
    } catch {
      // Ollama not reachable
    }

    let credentialVaultHealthy = false
    try {
      await ctx.credentialVaultService.getMetadata(SYSTEM_APP_ID, 'health-check')
      credentialVaultHealthy = true
    } catch {
      credentialVaultHealthy = false
    }

    return {
      ollama: {
        running: ollamaRunning,
        models: ollamaModels,
      },
      configuredProviders,
      credentialVaultHealthy,
    };
  }),
});
