import type {
  IModelProvider,
  ModelProviderConfig,
  ProviderVendor,
} from '@nous/shared';

export interface ProviderFactoryCreateOptions {
  apiKey?: string;
}

export interface ProviderFactoryModule {
  readonly vendorKey: ProviderVendor;
  create(
    config: ModelProviderConfig,
    options?: ProviderFactoryCreateOptions,
  ): IModelProvider;
}
