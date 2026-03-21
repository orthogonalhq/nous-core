/**
 * ProviderRegistry — Maps ProviderId to IModelProvider.
 *
 * Creates provider instances from config. Used by router consumers to obtain
 * the actual provider after routing.
 */
import type {
  IConfig,
  IModelProvider,
  ModelProviderConfig,
  ProviderId,
} from '@nous/shared';
import {
  ConfigError,
  ProviderIdSchema,
  ModelProviderConfigSchema,
} from '@nous/shared';
import type { ProviderConfigEntry } from '@nous/autonomic-config';
import type { LaneLeaseReleasedEvent } from './inference-lane-registry.js';
import { InferenceLaneRegistry } from './inference-lane-registry.js';
import { LaneAwareProvider } from './lane-aware-provider.js';
import { OllamaProvider } from './ollama-provider.js';
import { OpenAiCompatibleProvider } from './openai-provider.js';

export class ProviderRegistry {
  private readonly providers = new Map<string, IModelProvider>();
  readonly laneRegistry: InferenceLaneRegistry;
  private static readonly ANTHROPIC_ENDPOINT = 'https://api.anthropic.com';

  constructor(config: IConfig, options?: { laneRegistry?: InferenceLaneRegistry }) {
    this.laneRegistry = options?.laneRegistry ?? new InferenceLaneRegistry();
    const configObj = config.get() as { providers?: ProviderConfigEntry[] };
    const entries = Array.isArray(configObj.providers) ? configObj.providers : [];

    for (const entry of entries) {
      const idResult = ProviderIdSchema.safeParse(entry.id);
      if (!idResult.success) {
        throw new ConfigError(
          `Provider "${entry.name}" has invalid id "${entry.id}" (must be UUID)`,
          { providerName: entry.name, providerId: entry.id },
        );
      }

      const providerConfig: ModelProviderConfig = {
        id: idResult.data,
        name: entry.name,
        type: entry.type,
        endpoint: entry.endpoint,
        modelId: entry.modelId,
        isLocal: entry.isLocal,
        maxTokens: entry.maxTokens,
        capabilities: entry.capabilities ?? [],
        providerClass: entry.providerClass,
        meetsProfiles: entry.meetsProfiles,
      };

      const validated = this.validateProviderConfig(providerConfig);
      const provider = this.createProvider(validated);
      this.providers.set(validated.id, provider);
    }
  }

  getProvider(id: ProviderId): IModelProvider | null {
    return this.providers.get(id) ?? null;
  }

  listProviders(): ModelProviderConfig[] {
    return Array.from(this.providers.values()).map((p) => p.getConfig());
  }

  registerProvider(config: ModelProviderConfig): void {
    const validated = this.validateProviderConfig(config);
    const provider = this.createProvider(validated);
    this.providers.set(validated.id, provider);
    console.log(
      `[nous:providers] registerProvider: registered ${validated.name} (${validated.id})`,
    );
  }

  removeProvider(id: ProviderId): boolean {
    const removed = this.providers.delete(id);
    if (removed) {
      console.log(`[nous:providers] removeProvider: removed ${id}`);
    }
    return removed;
  }

  onLeaseReleased(listener: (event: LaneLeaseReleasedEvent) => void): () => void {
    return this.laneRegistry.onLeaseReleased(listener);
  }

  private validateProviderConfig(config: ModelProviderConfig): ModelProviderConfig {
    const validated = ModelProviderConfigSchema.safeParse(config);
    if (!validated.success) {
      throw new ConfigError(
        `Provider "${config.name}" has invalid configuration`,
        {
          providerName: config.name,
          providerId: config.id,
          errors: validated.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      );
    }

    return validated.data;
  }

  private resolveRemoteApiKey(config: ModelProviderConfig): string | undefined {
    const endpoint = config.endpoint?.toLowerCase() ?? '';
    const providerName = config.name.toLowerCase();

    if (endpoint.includes('anthropic') || providerName.includes('anthropic')) {
      return process.env.ANTHROPIC_API_KEY;
    }

    return process.env.OPENAI_API_KEY;
  }

  private normalizeRemoteConfig(config: ModelProviderConfig): ModelProviderConfig {
    const endpoint = config.endpoint?.toLowerCase() ?? '';
    const providerName = config.name.toLowerCase();

    if (endpoint.includes('anthropic') || providerName.includes('anthropic')) {
      return {
        ...config,
        endpoint: ProviderRegistry.ANTHROPIC_ENDPOINT,
      };
    }

    return config;
  }

  private createProvider(config: ModelProviderConfig): IModelProvider {
    const normalizedConfig = config.isLocal
      ? config
      : this.normalizeRemoteConfig(config);
    const provider = config.isLocal
      ? new OllamaProvider(normalizedConfig)
      : new OpenAiCompatibleProvider(normalizedConfig, {
          apiKey: this.resolveRemoteApiKey(normalizedConfig),
        });
    return new LaneAwareProvider(
      provider,
      this.laneRegistry.getOrCreate(normalizedConfig),
    );
  }
}
