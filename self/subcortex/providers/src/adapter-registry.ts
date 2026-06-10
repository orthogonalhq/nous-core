import type { ILogChannel } from '@nous/shared';
import { PROVIDER_DEFINITIONS } from './provider-definitions.js';
import { CERTIFIED_PROVIDER_ADAPTER_MODULES } from './provider-adapters.js';
import { textAdapter } from './shared/text-adapter.js';
import type {
  ProviderAdapter,
  ProviderAdapterCreateOptions,
  ProviderAdapterModule,
} from './schemas/provider-adapter.js';

export const ADAPTER_MODULES = [
  ...CERTIFIED_PROVIDER_ADAPTER_MODULES,
  textAdapter,
] as const satisfies readonly ProviderAdapterModule[];

type ProviderConfigLike = {
  readonly name?: string;
  readonly type?: string;
  readonly vendor?: string;
  readonly adapterKey?: string;
  readonly modelId?: string;
};

export interface AdapterRegistryInstance<
  TModules extends readonly ProviderAdapterModule[] = readonly ProviderAdapterModule[],
> {
  readonly modules: TModules;
  readonly moduleByKey: ReadonlyMap<string, TModules[number]>;
  resolveModule(adapterKey: string | undefined): TModules[number] | typeof textAdapter;
  resolveAdapter(
    adapterKey: string | undefined,
    options?: ProviderAdapterCreateOptions,
  ): ProviderAdapter;
}

const PROVIDER_DEFINITION_BY_VENDOR: ReadonlyMap<string, (typeof PROVIDER_DEFINITIONS)[number]> = new Map(
  PROVIDER_DEFINITIONS.map((definition) => [
    definition.vendorKey,
    definition,
  ]),
);

export function normalizeAdapterKey(adapterKey: string | undefined): string {
  if (!adapterKey) return 'text';
  if (adapterKey === 'openai') return 'chat-completions';
  return adapterKey;
}

export function buildAdapterRegistry<const TModules extends readonly ProviderAdapterModule[]>(
  modules: TModules,
): AdapterRegistryInstance<TModules> {
  const moduleByKey = new Map<string, TModules[number]>();
  for (const module of modules) {
    moduleByKey.set(module.adapterKey, module);
  }

  function resolveModule(adapterKey: string | undefined): TModules[number] | typeof textAdapter {
    const normalized = normalizeAdapterKey(adapterKey);
    return moduleByKey.get(normalized) ?? textAdapter;
  }

  return {
    modules,
    moduleByKey,
    resolveModule,
    resolveAdapter(adapterKey, options) {
      return resolveModule(adapterKey).create(options);
    },
  };
}

export const ADAPTER_REGISTRY = buildAdapterRegistry(ADAPTER_MODULES);

export function resolveAdapter(
  adapterKey: string | undefined,
  options?: ProviderAdapterCreateOptions,
): ProviderAdapter {
  return ADAPTER_REGISTRY.resolveAdapter(adapterKey, options);
}

export function resolveAdapterWithLog(
  adapterKey: string | undefined,
  log?: ILogChannel,
): ProviderAdapter {
  return resolveAdapter(adapterKey, { log });
}

export function resolveAdapterKeyFromConfig(provider: {
  getConfig(): ProviderConfigLike;
}): string {
  try {
    const config = provider.getConfig();
    if (typeof config.adapterKey === 'string' && config.adapterKey.length > 0) {
      return normalizeAdapterKey(config.adapterKey);
    }

    const vendor = config.vendor;
    if (vendor) {
      const definition = PROVIDER_DEFINITION_BY_VENDOR.get(vendor);
      if (definition) {
        return normalizeAdapterKey(definition.adapterKey);
      }
    }

    const name = (config.name ?? config.type ?? '').toLowerCase();
    if (name.includes('anthropic') || name.includes('claude')) return 'anthropic';
    if (name.includes('openai') || name.includes('gpt')) return 'chat-completions';
    if (name.includes('ollama')) return 'ollama';
    return 'text';
  } catch {
    return 'text';
  }
}

export const resolveProviderTypeFromConfig = resolveAdapterKeyFromConfig;
