import { z } from 'zod';
import type { ProviderDefinition } from '@nous/subcortex-providers';

export type ProviderModelDiscoveryModel = {
  id: string;
  name: string;
  provider: string;
  providerLabel?: string;
  available: boolean;
};

export type ProviderModelDiscoveryResult = {
  models: ProviderModelDiscoveryModel[];
  cacheable: boolean;
};

export type ProviderApiKeyTestResult = {
  valid: boolean;
  error: string | null;
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

const KNOWN_FALLBACK_MODELS: Record<string, ProviderModelDiscoveryModel[]> = {
  anthropic: [
    {
      id: 'anthropic:claude-sonnet-4-20250514',
      name: 'Claude Sonnet 4 (cached)',
      provider: 'anthropic',
      providerLabel: 'Anthropic',
      available: false,
    },
    {
      id: 'anthropic:claude-opus-4-20250514',
      name: 'Claude Opus 4 (cached)',
      provider: 'anthropic',
      providerLabel: 'Anthropic',
      available: false,
    },
  ],
  openai: [
    {
      id: 'openai:gpt-4o',
      name: 'GPT-4o (cached)',
      provider: 'openai',
      providerLabel: 'OpenAI',
      available: false,
    },
  ],
};

function cloneModels(
  models: ProviderModelDiscoveryModel[],
): ProviderModelDiscoveryModel[] {
  return models.map((model) => ({ ...model }));
}

function fallbackModelsFor(
  definition: ProviderDefinition,
): ProviderModelDiscoveryModel[] {
  const known = KNOWN_FALLBACK_MODELS[definition.vendorKey];
  if (known) {
    return cloneModels(known);
  }

  return [
    {
      id: `${definition.vendorKey}:${definition.defaultModelId}`,
      name: `${definition.defaultModelId} (cached)`,
      provider: definition.vendorKey,
      providerLabel: definition.displayName,
      available: false,
    },
  ];
}

function providerEndpointUrl(
  definition: ProviderDefinition,
  endpoint: string,
): string {
  return `${definition.defaultEndpoint.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;
}

export function providerAuthHeaders(
  definition: ProviderDefinition,
  apiKey: string,
): Record<string, string> {
  const authHeader = definition.auth.header;
  if (!authHeader) {
    throw new Error(
      `Provider '${definition.vendorKey}' is missing API-key header metadata`,
    );
  }

  return {
    ...definition.headers,
    [authHeader.name]: authHeader.scheme === 'bearer'
      ? `Bearer ${apiKey}`
      : apiKey,
  };
}

function chatModelIsAllowed(
  definition: ProviderDefinition,
  modelId: string,
): boolean {
  const prefixes = definition.chatModelPrefixes;
  if (!prefixes?.length) {
    return true;
  }

  return prefixes.some((prefix) => modelId.startsWith(prefix));
}

export function providerSupportsModelDiscovery(
  definition: ProviderDefinition,
): boolean {
  return !!definition.modelListEndpoint;
}

export async function fetchProviderModels(
  definition: ProviderDefinition,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ProviderModelDiscoveryResult> {
  const endpoint = definition.modelListEndpoint;
  if (!endpoint) {
    return { models: [], cacheable: false };
  }

  try {
    const url = providerEndpointUrl(definition, endpoint);
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: providerAuthHeaders(definition, apiKey),
    });

    if (!response.ok) {
      console.warn(
        `[nous:preferences] Failed to fetch ${definition.vendorKey} models: HTTP ${response.status}. Using fallback list.`,
      );
      return {
        models: fallbackModelsFor(definition),
        cacheable: false,
      };
    }

    if (definition.protocol === 'anthropic-messages') {
      const parsed = AnthropicModelsResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        console.warn(
          `[nous:preferences] Failed to parse ${definition.vendorKey} ${endpoint} response. Using fallback list.`,
        );
        return {
          models: fallbackModelsFor(definition),
          cacheable: false,
        };
      }

      if (parsed.data.has_more) {
        console.warn(
          `[nous:preferences] ${definition.vendorKey} ${endpoint} has_more=true - some models may not be listed`,
        );
      }

      const models = parsed.data.data.map((model) => ({
        id: `${definition.vendorKey}:${model.id}`,
        name: model.display_name,
        provider: definition.vendorKey,
        providerLabel: definition.displayName,
        available: true,
      }));

      console.info(
        `[nous:preferences] Fetched ${models.length} models from ${definition.vendorKey} ${endpoint}`,
      );

      return { models, cacheable: true };
    }

    if (definition.protocol === 'chat-completions') {
      const parsed = OpenAIModelsResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        console.warn(
          `[nous:preferences] Failed to parse ${definition.vendorKey} ${endpoint} response. Using fallback list.`,
        );
        return {
          models: fallbackModelsFor(definition),
          cacheable: false,
        };
      }

      const models = parsed.data.data
        .filter((model) => chatModelIsAllowed(definition, model.id))
        .map((model) => ({
          id: `${definition.vendorKey}:${model.id}`,
          name: model.id,
          provider: definition.vendorKey,
          providerLabel: definition.displayName,
          available: true,
        }));

      console.info(
        `[nous:preferences] Fetched ${models.length} models from ${definition.vendorKey} ${endpoint}`,
      );

      return { models, cacheable: true };
    }

    console.warn(
      `[nous:preferences] Provider '${definition.vendorKey}' uses unsupported model-list protocol '${definition.protocol}'. Using fallback list.`,
    );
    return {
      models: fallbackModelsFor(definition),
      cacheable: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[nous:preferences] Network error fetching ${definition.vendorKey} models: ${message}. Using fallback list.`,
    );
    return {
      models: fallbackModelsFor(definition),
      cacheable: false,
    };
  }
}

export async function testProviderApiKey(
  definition: ProviderDefinition,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ProviderApiKeyTestResult> {
  const endpoint = definition.healthCheckEndpoint ?? definition.modelListEndpoint;
  if (!endpoint) {
    return {
      valid: false,
      error: `Provider '${definition.vendorKey}' does not define a health-check or model-list endpoint.`,
    };
  }

  const response = await fetchImpl(providerEndpointUrl(definition, endpoint), {
    method: 'GET',
    headers: providerAuthHeaders(definition, apiKey),
  });

  if (response.ok) {
    return { valid: true, error: null };
  }

  const body = await response.text();
  return {
    valid: false,
    error: `HTTP ${response.status}: ${body.slice(0, 200)}`,
  };
}
