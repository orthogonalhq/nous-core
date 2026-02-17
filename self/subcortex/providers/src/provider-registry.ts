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
import { ProviderIdSchema, ModelProviderConfigSchema } from '@nous/shared';
import type { ProviderConfigEntry } from '@nous/autonomic-config';
import { OllamaProvider } from './ollama-provider.js';
import { OpenAiCompatibleProvider } from './openai-provider.js';

export class ProviderRegistry {
  private readonly providers = new Map<string, IModelProvider>();

  constructor(config: IConfig) {
    const configObj = config.get() as { providers?: ProviderConfigEntry[] };
    const entries = Array.isArray(configObj.providers) ? configObj.providers : [];

    for (const entry of entries) {
      const idResult = ProviderIdSchema.safeParse(entry.id);
      if (!idResult.success) {
        console.warn(
          `[nous:providers] Skipping provider "${entry.name}" — id must be UUID`,
        );
        continue;
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
      };

      const validated = ModelProviderConfigSchema.safeParse(providerConfig);
      if (!validated.success) {
        console.warn(
          `[nous:providers] Skipping provider "${entry.name}" — invalid config`,
        );
        continue;
      }

      const provider = this.createProvider(validated.data);
      this.providers.set(validated.data.id, provider);
    }
  }

  getProvider(id: ProviderId): IModelProvider | null {
    return this.providers.get(id) ?? null;
  }

  listProviders(): ModelProviderConfig[] {
    return Array.from(this.providers.values()).map((p) => p.getConfig());
  }

  private createProvider(config: ModelProviderConfig): IModelProvider {
    if (config.isLocal) {
      return new OllamaProvider(config);
    }
    return new OpenAiCompatibleProvider(config);
  }
}
