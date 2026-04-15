/**
 * ProviderRegistry — Maps ProviderId to IModelProvider.
 *
 * Creates provider instances from config. Used by router consumers to obtain
 * the actual provider after routing.
 */
import type {
  IConfig,
  IEventBus,
  IModelProvider,
  ModelProviderConfig,
  ProviderId,
  ProviderVendor,
} from '@nous/shared';
import {
  ConfigError,
  KNOWN_PROVIDER_VENDORS,
  ProviderIdSchema,
  ModelProviderConfigSchema,
} from '@nous/shared';
import type { ProviderConfigEntry } from '@nous/autonomic-config';
import type { LaneLeaseReleasedEvent } from './inference-lane-registry.js';
import { AnthropicProvider } from './anthropic-provider.js';
import { InferenceLaneRegistry } from './inference-lane-registry.js';
import { LaneAwareProvider } from './lane-aware-provider.js';
import { ObservableProvider } from './observable-provider.js';
import { OllamaProvider } from './ollama-provider.js';
import { OpenAiCompatibleProvider } from './openai-provider.js';

export class ProviderRegistry {
  private readonly providers = new Map<string, IModelProvider>();
  readonly laneRegistry: InferenceLaneRegistry;
  private readonly eventBus: IEventBus | undefined;
  private static readonly ANTHROPIC_ENDPOINT = 'https://api.anthropic.com';

  constructor(config: IConfig, options?: { laneRegistry?: InferenceLaneRegistry; eventBus?: IEventBus }) {
    this.laneRegistry = options?.laneRegistry ?? new InferenceLaneRegistry();
    this.eventBus = options?.eventBus;
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

      const baseConfig: ModelProviderConfig = {
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
        vendor: entry.vendor,
      };
      // Stamp vendor early (WR-138 row #3). Legacy persisted entries that
      // lack the field on disk fall through `entry.vendor ?? resolveVendor(...)`
      // WITHOUT emitting the unknown-vendor info log — the log fires only from
      // the explicit branching-helper-cannot-classify path inside createProvider.
      const providerConfig: ModelProviderConfig = {
        ...baseConfig,
        vendor: baseConfig.vendor ?? this.resolveVendor(baseConfig),
      };

      // Skip non-local entries whose API key is not yet available.
      // The post-boot flow (loadStoredApiKeys → registerStoredProviders) will
      // register these providers after credentials are loaded from the vault.
      if (!providerConfig.isLocal) {
        const apiKey = this.resolveRemoteApiKey(providerConfig);
        if (!apiKey) {
          console.info(
            `[nous:providers] Skipping provider '${entry.name}' during construction — ` +
            `API key not yet available (will be registered after credential vault loads)`,
          );
          continue;
        }
      }

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
    // Stamp vendor early (WR-138 row #3) so the settings-UI upsert path
    // (`upsertProviderConfig` in shared-server bootstrap) flows through the
    // same vendor pipeline as the constructor entry loop.
    const stamped: ModelProviderConfig = {
      ...config,
      vendor: config.vendor ?? this.resolveVendor(config),
    };
    const validated = this.validateProviderConfig(stamped);
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
    if (this.isAnthropicProvider(config)) {
      return process.env.ANTHROPIC_API_KEY;
    }

    return process.env.OPENAI_API_KEY;
  }

  private normalizeRemoteConfig(config: ModelProviderConfig): ModelProviderConfig {
    if (this.isAnthropicProvider(config)) {
      return {
        ...config,
        endpoint: ProviderRegistry.ANTHROPIC_ENDPOINT,
      };
    }

    return config;
  }

  private isAnthropicProvider(config: ModelProviderConfig): boolean {
    const endpoint = config.endpoint?.toLowerCase() ?? '';
    const providerName = config.name.toLowerCase();

    return endpoint.includes('anthropic') || providerName.includes('anthropic');
  }

  /**
   * Resolve the provider vendor key for a config via exhaustive branching
   * over the three known concrete provider classes. Used at stamp time (row #3
   * of WR-138) so downstream readers can call `provider.getConfig().vendor`
   * without falling back to name-pattern sniffing or UUID probing.
   *
   * The unknown-vendor info log per `provider-vendor-field-v1.md` § 4 fires
   * from the explicit "branching helper cannot classify" path. The current
   * three-branch form is exhaustive for today's production provider classes,
   * so the log is a forward-compat hook for future plugin subclasses that
   * bypass the branches.
   */
  private resolveVendor(config: ModelProviderConfig): ProviderVendor {
    if (config.isLocal) return 'ollama';
    if (this.isAnthropicProvider(config)) return 'anthropic';
    // Current default: any non-local, non-Anthropic config is OpenAI-compatible.
    // Any future plugin subclass that needs disambiguation should extend this
    // helper with a new branch rather than stamping `'openai'` by default.
    return 'openai';
  }

  private createProvider(config: ModelProviderConfig): IModelProvider {
    const baseConfig = config.isLocal
      ? config
      : this.normalizeRemoteConfig(config);
    // Defense-in-depth stamp: `baseConfig.vendor ?? this.resolveVendor(baseConfig)`
    // honors any upstream stamping (constructor entry loop / registerProvider)
    // and fills in the field if the caller bypassed the upstream sites.
    const resolvedVendor = baseConfig.vendor ?? this.resolveVendor(baseConfig);
    if (!KNOWN_PROVIDER_VENDORS.includes(resolvedVendor as (typeof KNOWN_PROVIDER_VENDORS)[number])) {
      console.info(
        `[nous:providers] Provider ${baseConfig.id} stamped with unknown vendor ` +
          `'${resolvedVendor}' — adapter will fall back to text. Add a vendor ` +
          `adapter in @nous/cortex-core if needed.`,
      );
    }
    const normalizedConfig: ModelProviderConfig = {
      ...baseConfig,
      vendor: resolvedVendor,
    };
    const provider = normalizedConfig.isLocal
      ? new OllamaProvider(normalizedConfig)
      : this.isAnthropicProvider(normalizedConfig)
        ? new AnthropicProvider(normalizedConfig, {
            apiKey: this.resolveRemoteApiKey(normalizedConfig),
          })
        : new OpenAiCompatibleProvider(normalizedConfig, {
            apiKey: this.resolveRemoteApiKey(normalizedConfig),
          });
    const lane = this.laneRegistry.getOrCreate(normalizedConfig);
    const laneAware = new LaneAwareProvider(provider, lane);

    if (this.eventBus) {
      return new ObservableProvider(laneAware, this.eventBus, {
        providerId: normalizedConfig.id,
        modelId: normalizedConfig.modelId,
        laneKey: lane.laneKey,
      });
    }

    return laneAware;
  }
}
