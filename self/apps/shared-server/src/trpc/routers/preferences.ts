/**
 * Preferences tRPC router — API key management, system status, and model selection.
 */
import { z } from 'zod';
import {
  ModelRoleSchema,
  type CliExecutionCapabilityProfile,
  type ModelRole,
  type ProviderId,
} from '@nous/shared';
import {
  PROVIDER_DEFINITIONS,
  type ProviderDefinition,
  type ProviderVendorKey,
} from '@nous/subcortex-providers';
import type { NousContext } from '../../context';
import { router, publicProcedure } from '../trpc';
import { detectOllama } from '../../ollama-detection';
import { getOllamaEndpointFromContext } from '../../ollama-config';
import {
  OLLAMA_WELL_KNOWN_PROVIDER_ID,
  WELL_KNOWN_PROVIDER_IDS,
  buildOllamaProviderConfig,
  buildProviderConfig,
  currentProviderEntries,
  currentRoleAssignment,
  parseSelectedModelSpec,
  registerConfiguredProvider,
  removeConfiguredProvider,
  updateRoleAssignment,
  upsertProviderConfig,
} from '../../bootstrap';
import {
  assertProviderDefinitionCompatibleWithRole,
  roleCompatibilityMapForProviderDefinition,
  type RoleCompatibilityResult,
} from '../../provider-capability-compatibility';
import {
  fetchProviderModels,
  providerSupportsModelDiscovery,
  testProviderApiKey,
  type ProviderModelDiscoveryResult,
} from '../../provider-model-discovery';

const SYSTEM_APP_ID = 'nous:system';

type ProviderDefinitionEntry = (typeof PROVIDER_DEFINITIONS)[number];

function providerAuth(
  definition: ProviderDefinitionEntry,
): ProviderDefinition['auth'] {
  return definition.auth as ProviderDefinition['auth'];
}

function providerCapabilities(
  definition: ProviderDefinitionEntry,
): ProviderDefinition['capabilities'] {
  return definition.capabilities as ProviderDefinition['capabilities'];
}

function providerAgentCli(
  definition: ProviderDefinitionEntry,
): ProviderDefinition['agentCli'] {
  return (definition as ProviderDefinition).agentCli;
}

function isApiKeyProviderDefinition(
  definition: ProviderDefinitionEntry,
): boolean {
  const auth = providerAuth(definition);
  return (
    auth.purpose === 'api_key' &&
    auth.required === true &&
    !!auth.envVar &&
    !!auth.vaultKeyNamespace
  );
}

function apiKeyProviderDefinitions(): ProviderDefinitionEntry[] {
  return PROVIDER_DEFINITIONS.filter(isApiKeyProviderDefinition);
}

function providerDefinitionFor(
  provider: ProviderVendorKey,
): ProviderDefinitionEntry {
  const definition = PROVIDER_DEFINITIONS.find(
    (candidate) => candidate.vendorKey === provider,
  );
  if (!definition) {
    throw new Error(`Provider definition is missing for vendor key '${provider}'`);
  }
  return definition;
}

function isApiKeyProviderKey(value: string): value is ProviderVendorKey {
  return apiKeyProviderDefinitions().some(
    (definition) => definition.vendorKey === value,
  );
}

const ProviderSchema = z.string().refine(isApiKeyProviderKey, {
  message: 'Unsupported API-key provider',
}) as z.ZodType<ProviderVendorKey>;
type Provider = z.infer<typeof ProviderSchema>;

type AvailableModel = {
  id: string;
  name: string;
  provider: string;
  providerLabel?: string;
  available: boolean;
  authKind?: ProviderAuthKind;
  availabilityReason?: string;
  executionCapabilityProfile?: CliExecutionCapabilityProfile;
  roleCompatibility?: Partial<Record<ModelRole, RoleCompatibilityResult>>;
};

type CachedModelList = {
  models: AvailableModel[];
  fetchedAt: number;
};

const MODEL_ROLES = [...ModelRoleSchema.options] as ModelRole[];
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;
const modelCache = new Map<Provider, CachedModelList>();

type RoleAssignmentSummary = {
  providerId: ProviderId;
  fallbackProviderId?: ProviderId;
  modelSpec: string | null;
};

type ProviderConnectionStatus =
  | 'ready'
  | 'missing_credentials'
  | 'not_running'
  | 'not_checked'
  | 'unavailable';

type ProviderAuthKind = 'api_key' | 'local_session' | 'none' | 'custom';

type ProviderConnection = {
  provider: string;
  displayName: string;
  authKind: ProviderAuthKind;
  configured: boolean;
  selectable: boolean;
  status: ProviderConnectionStatus;
  message?: string;
  setupCommand?: string;
  versionCommand?: string;
};

function vaultKey(provider: Provider): string {
  const namespace = providerAuth(providerDefinitionFor(provider)).vaultKeyNamespace ?? provider;
  return `api_key_${namespace}`;
}

function providerLabelFor(provider: ProviderVendorKey): string {
  return providerDefinitionFor(provider).displayName;
}

function providerAuthKind(
  definition: ProviderDefinitionEntry,
): ProviderAuthKind {
  if (isApiKeyProviderDefinition(definition)) {
    return 'api_key';
  }

  const agentCliAuthKind = providerAgentCli(definition)?.auth.kind;
  if (agentCliAuthKind === 'local_session' || agentCliAuthKind === 'none') {
    return agentCliAuthKind;
  }

  if (agentCliAuthKind === 'api_key') {
    return 'api_key';
  }

  if (agentCliAuthKind) {
    return 'custom';
  }

  return 'none';
}

function providerAvailabilityReason(
  definition: ProviderDefinitionEntry,
): string | undefined {
  const agentCli = providerAgentCli(definition);
  return agentCli?.auth.description ?? agentCli?.install?.notes;
}

function providerMetadataForModel(definition: ProviderDefinitionEntry): Pick<
  AvailableModel,
  'executionCapabilityProfile' | 'roleCompatibility'
> {
  const providerDefinition = definition as ProviderDefinition;
  const roleCompatibility = roleCompatibilityMapForProviderDefinition(providerDefinition, MODEL_ROLES);
  return {
    ...(providerDefinition.executionCapabilityProfile
      ? { executionCapabilityProfile: providerDefinition.executionCapabilityProfile }
      : {}),
    ...(providerDefinition.protocol === 'agent-cli' ? { roleCompatibility } : {}),
  };
}

function apiKeyCredentialConfig(provider: Provider): {
  envVar: string;
  targetHost: string;
  injectionKey: string;
} {
  const definition = providerDefinitionFor(provider);
  const auth = providerAuth(definition);
  const envVar = auth.envVar;
  if (!envVar) {
    throw new Error(`Provider '${provider}' is missing API-key envVar metadata`);
  }
  if (!auth.header) {
    throw new Error(`Provider '${provider}' is missing API-key header metadata`);
  }

  return {
    envVar,
    targetHost: new URL(definition.defaultEndpoint).host,
    injectionKey: auth.header.name,
  };
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

function defaultSelectableModels(): AvailableModel[] {
  return PROVIDER_DEFINITIONS.filter((definition) => {
    const capabilities = providerCapabilities(definition);
    return (
      !isApiKeyProviderDefinition(definition) &&
      capabilities?.modelListing !== true
    );
  }).map((definition) => {
    const availabilityReason = providerAvailabilityReason(definition);
    return {
      id: `${definition.vendorKey}:${definition.defaultModelId}`,
      name: `${definition.displayName} (default)`,
      provider: definition.vendorKey,
      providerLabel: providerLabelFor(definition.vendorKey),
      available: true,
      authKind: providerAuthKind(definition),
      ...(availabilityReason ? { availabilityReason } : {}),
      ...providerMetadataForModel(definition),
    };
  });
}

async function providerConnectionForApiKeyProvider(
  ctx: NousContext,
  definition: ProviderDefinitionEntry,
): Promise<ProviderConnection> {
  const provider = definition.vendorKey as Provider;
  const metadata = await ctx.credentialVaultService.getMetadata(
    SYSTEM_APP_ID,
    vaultKey(provider),
  );
  const configured = !!metadata;

  return {
    provider,
    displayName: providerLabelFor(provider),
    authKind: 'api_key',
    configured,
    selectable: configured,
    status: configured ? 'ready' : 'missing_credentials',
    message: configured
      ? 'API key is configured.'
      : `Add a ${providerLabelFor(provider)} API key before using this provider.`,
  };
}

function providerConnectionForAgentCliProvider(
  definition: ProviderDefinitionEntry,
): ProviderConnection {
  const install = providerAgentCli(definition)?.install;
  const message = providerAvailabilityReason(definition);

  return {
    provider: definition.vendorKey,
    displayName: definition.displayName,
    authKind: providerAuthKind(definition),
    configured: false,
    selectable: true,
    status: 'not_checked',
    ...(message ? { message } : {}),
    ...(install?.command ? { setupCommand: install.command } : {}),
    ...(install?.versionCommand ? { versionCommand: install.versionCommand } : {}),
  };
}

function providerConnectionForOllama(ollamaStatus: {
  running: boolean;
}): ProviderConnection {
  const configured = ollamaStatus.running;

  return {
    provider: 'ollama',
    displayName: providerLabelFor('ollama'),
    authKind: 'none',
    configured,
    selectable: configured,
    status: configured ? 'ready' : 'not_running',
    message: configured
      ? 'Ollama is running.'
      : 'Start Ollama before using local Ollama models.',
  };
}

async function getProviderConnections(
  ctx: NousContext,
  ollamaStatus: { running: boolean },
): Promise<ProviderConnection[]> {
  return Promise.all(
    PROVIDER_DEFINITIONS.map((definition) => {
      if (isApiKeyProviderDefinition(definition)) {
        return providerConnectionForApiKeyProvider(ctx, definition);
      }

      if (definition.vendorKey === 'ollama') {
        return Promise.resolve(providerConnectionForOllama(ollamaStatus));
      }

      if (providerAgentCli(definition)) {
        return Promise.resolve(providerConnectionForAgentCliProvider(definition));
      }

      const connection: ProviderConnection = {
        provider: definition.vendorKey,
        displayName: definition.displayName,
        authKind: providerAuthKind(definition),
        configured: false,
        selectable: false,
        status: 'not_checked',
      };
      return Promise.resolve(connection);
    }),
  );
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

function shouldCacheModelDiscovery(definition: ProviderDefinition): boolean {
  return !definition.isLocal;
}

async function getDiscoveredModelsForProvider(
  ctx: NousContext,
  provider: Provider,
  options: { baseUrl?: string } = {},
): Promise<AvailableModel[]> {
  try {
    const definition = providerDefinitionFor(provider);
    const auth = providerAuth(definition);
    let apiKey = '';

    if (auth.required) {
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
      apiKey = resolved.secretValue;
    }

    if (shouldCacheModelDiscovery(definition as ProviderDefinition)) {
      const cachedModels = getCachedModels(provider);
      if (cachedModels) {
        return cachedModels;
      }
    }

    if (!providerSupportsModelDiscovery(definition as ProviderDefinition)) {
      console.debug(
        `[nous:preferences] Skipping ${provider} model fetch - no model-list endpoint configured`,
      );
      return [];
    }

    const result: ProviderModelDiscoveryResult = await fetchProviderModels(
      definition as ProviderDefinition,
      apiKey,
      fetch,
      { baseUrl: options.baseUrl },
    );
    const models = result.models.map((model) => ({
      ...model,
      ...providerMetadataForModel(definition),
    }));

    if (result.cacheable && shouldCacheModelDiscovery(definition as ProviderDefinition)) {
      modelCache.set(provider, {
        models: cloneModels(models),
        fetchedAt: Date.now(),
      });
    }

    return cloneModels(models);
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
    const providers = apiKeyProviderDefinitions();
    const results: Array<{
      provider: Provider;
      displayName: string;
      configured: boolean;
      maskedKey: string | null;
      createdAt: string | null;
    }> = [];

    for (const definition of providers) {
      const provider = definition.vendorKey;
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
          displayName: providerLabelFor(provider),
          configured: true,
          maskedKey: resolved ? maskApiKey(resolved.secretValue) : null,
          createdAt: metadata.created_at,
        });
      } else {
        results.push({
          provider,
          displayName: providerLabelFor(provider),
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
      const config = apiKeyCredentialConfig(input.provider);

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
      modelCache.delete(input.provider);
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
      const config = apiKeyCredentialConfig(input.provider);

      const result = await ctx.credentialVaultService.revoke(SYSTEM_APP_ID, {
        key: vaultKey(input.provider),
        reason: 'user_deleted',
      });

      // Clear from process environment
      delete process.env[config.envVar];
      modelCache.delete(input.provider);
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

        return await testProviderApiKey(
          providerDefinitionFor(input.provider) as ProviderDefinition,
          resolvedKey,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { valid: false, error: message };
      }
    }),

  getAvailableModels: publicProcedure.query(async ({ ctx }) => {
    const ollamaEndpoint = getOllamaEndpointFromContext(ctx);
    const ollamaStatus = await detectOllama(ollamaEndpoint);
    const discoverableProviders = PROVIDER_DEFINITIONS
      .filter((definition) => providerSupportsModelDiscovery(definition as ProviderDefinition))
      .filter((definition) => {
        if (isApiKeyProviderDefinition(definition)) {
          return true;
        }
        return definition.protocol === 'ollama' && ollamaStatus.running;
      })
      .map((definition) => definition.vendorKey);
    const discoveredModelResults = await Promise.all(
      discoverableProviders.map((provider) => getDiscoveredModelsForProvider(
        ctx,
        provider,
        provider === 'ollama' ? { baseUrl: ollamaEndpoint } : undefined,
      )),
    );
    const discoveredModels = discoveredModelResults.flat();

    return { models: [...discoveredModels, ...defaultSelectableModels()] };
  }),

  getRoleAssignments: publicProcedure.query(async ({ ctx }) => {
    const providers = currentProviderEntries(ctx);
    return Object.fromEntries(
      MODEL_ROLES.map((role) => {
        const assignment = currentRoleAssignment(ctx, role);
        if (!assignment) {
          return [role, null];
        }

        const entry = providers.find((p) => p.id === assignment.providerId);
        const modelSpec = entry ? `${entry.name}:${entry.modelId}` : null;
        const value: RoleAssignmentSummary = {
          providerId: assignment.providerId,
          modelSpec,
          ...(assignment.fallbackProviderId
            ? { fallbackProviderId: assignment.fallbackProviderId }
            : {}),
        };

        return [role, value];
      }),
    ) as Record<ModelRole, RoleAssignmentSummary | null>;
  }),

  setRoleAssignment: publicProcedure
    .input(
      z.object({
        role: ModelRoleSchema,
        modelSpec: z.string().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.modelSpec) {
        await updateRoleAssignment(ctx, input.role, null);
        console.info(
          `[nous:preferences] Cleared ${input.role} assignment for auto-detect`,
        );
        return { success: true };
      }

      const selectedModel = parseSelectedModelSpec(input.modelSpec);
      if (!selectedModel) {
        const error = `Cannot parse model spec: ${input.modelSpec}`;
        console.warn(`[nous:preferences] ${error}. Skipping role assignment update.`);
        return { success: false, error };
      }

      try {
        const { providerId, providerConfig } = buildProviderSelection(selectedModel);
        assertProviderDefinitionCompatibleWithRole(
          input.role,
          providerDefinitionFor(selectedModel.provider),
        );

        await upsertProviderConfig(ctx, providerConfig);
        await updateRoleAssignment(ctx, input.role, providerId);

        // WR-148 phase 1.1: trigger runtime harness recomposition for
        // affected agent classes when model role assignments change.
        const ROLE_TO_AGENT_CLASS: Record<string, 'Cortex::Principal' | 'Cortex::System' | null> = {
          'cortex-chat': 'Cortex::Principal',
          'cortex-system': 'Cortex::System',
          orchestrators: null,  // dispatch-time, not recomposed
          workers: null,        // dispatch-time, not recomposed
        };
        const agentClass = ROLE_TO_AGENT_CLASS[input.role];
        if (agentClass && providerConfig.vendor) {
          ctx.gatewayRuntime.recomposeHarnessForClass(agentClass, providerConfig.vendor);
        }

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
    const ollamaStatus = await detectOllama();
    const providerConnections = await getProviderConnections(ctx, ollamaStatus);
    const configuredProviders = providerConnections
      .filter((connection) => connection.authKind === 'api_key' && connection.configured)
      .map((connection) => connection.provider);

    let credentialVaultHealthy = false
    try {
      await ctx.credentialVaultService.getMetadata(SYSTEM_APP_ID, 'health-check')
      credentialVaultHealthy = true
    } catch {
      credentialVaultHealthy = false
    }

    return {
      ollama: {
        running: ollamaStatus.running,
        models: ollamaStatus.models,
      },
      configuredProviders,
      providerConnections,
      credentialVaultHealthy,
    };
  }),
});
