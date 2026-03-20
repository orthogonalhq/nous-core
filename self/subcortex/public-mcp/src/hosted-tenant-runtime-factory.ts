import type {
  IDocumentStore,
  IVectorStore,
  PublicMcpHostedTenantBindingRecord,
} from '@nous/shared';

export interface HostedTenantRuntimeFactoryContext {
  binding: PublicMcpHostedTenantBindingRecord;
  documentStore: IDocumentStore;
  vectorStore?: IVectorStore;
}

export interface HostedTenantRuntimeFactoryOptions<TBundle> {
  documentStore: IDocumentStore;
  vectorStore?: IVectorStore;
  build: (context: HostedTenantRuntimeFactoryContext) => Promise<TBundle> | TBundle;
}

function qualifyCollection(prefix: string, collection: string): string {
  return `${prefix}:${collection}`;
}

export function createPrefixedDocumentStore(
  documentStore: IDocumentStore,
  prefix: string,
): IDocumentStore {
  return {
    put: async (collection, id, document) =>
      documentStore.put(qualifyCollection(prefix, collection), id, document),
    get: async (collection, id) =>
      documentStore.get(qualifyCollection(prefix, collection), id),
    query: async (collection, filter) =>
      documentStore.query(qualifyCollection(prefix, collection), filter),
    delete: async (collection, id) =>
      documentStore.delete(qualifyCollection(prefix, collection), id),
  };
}

export function createPrefixedVectorStore(
  vectorStore: IVectorStore,
  prefix: string,
): IVectorStore {
  return {
    upsert: async (collection, id, vector, metadata) =>
      vectorStore.upsert(qualifyCollection(prefix, collection), id, vector, metadata),
    search: async (collection, query, limit, filter) =>
      vectorStore.search(qualifyCollection(prefix, collection), query, limit, filter),
    delete: async (collection, id) =>
      vectorStore.delete(qualifyCollection(prefix, collection), id),
  };
}

export class HostedTenantRuntimeFactory<TBundle> {
  private readonly cache = new Map<string, Promise<TBundle>>();

  constructor(private readonly options: HostedTenantRuntimeFactoryOptions<TBundle>) {}

  async getOrCreate(binding: PublicMcpHostedTenantBindingRecord): Promise<TBundle> {
    const existing = this.cache.get(binding.bindingId);
    if (existing) {
      return existing;
    }

    const promise = Promise.resolve(
      this.options.build({
        binding,
        documentStore: createPrefixedDocumentStore(
          this.options.documentStore,
          binding.storePrefix,
        ),
        vectorStore: this.options.vectorStore
          ? createPrefixedVectorStore(this.options.vectorStore, binding.storePrefix)
          : undefined,
      }),
    );
    this.cache.set(binding.bindingId, promise);
    return promise;
  }
}
