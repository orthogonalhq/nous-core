import type {
  IDocumentStore,
  PublicMcpNamespace,
  PublicMcpNamespaceRecord,
} from '@nous/shared';
import { PublicMcpNamespaceRecordSchema } from '@nous/shared';

export const PUBLIC_MCP_NAMESPACE_COLLECTION = 'public_mcp_namespace_registry';

export interface NamespaceRegistryStoreOptions {
  now?: () => string;
}

export interface EnsureNamespaceInput {
  namespace: PublicMcpNamespace;
  clientId: string;
  clientIdHash: string;
  subspace?: string;
  bootstrapState?: 'reserved' | 'ready' | 'blocked';
}

export function deriveExternalCollectionNames(
  clientIdHash: string,
  subspace?: string,
) {
  const suffix = subspace ?? 'default';
  return {
    stmCollection: `external:stm:${clientIdHash}:${suffix}`,
    ltmCollection: `external:ltm:${clientIdHash}:${suffix}`,
    mutationAuditCollection: `external:audit:${clientIdHash}:${suffix}`,
    tombstoneCollection: `external:tombstones:${clientIdHash}:${suffix}`,
    vectorCollection: `external:vectors:${clientIdHash}:${suffix}`,
  };
}

export class NamespaceRegistryStore {
  private readonly now: () => string;

  constructor(
    private readonly documentStore: IDocumentStore,
    options: NamespaceRegistryStoreOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async get(namespace: string): Promise<PublicMcpNamespaceRecord | null> {
    const raw = await this.documentStore.get<unknown>(
      PUBLIC_MCP_NAMESPACE_COLLECTION,
      namespace,
    );
    if (!raw) {
      return null;
    }
    return PublicMcpNamespaceRecordSchema.parse(raw);
  }

  async ensureNamespace(
    input: EnsureNamespaceInput,
  ): Promise<PublicMcpNamespaceRecord> {
    const now = this.now();
    const existing = await this.get(input.namespace);
    if (existing) {
      const updated = PublicMcpNamespaceRecordSchema.parse({
        ...existing,
        lastSeenAt: now,
      });
      await this.documentStore.put(
        PUBLIC_MCP_NAMESPACE_COLLECTION,
        updated.namespace,
        updated,
      );
      return updated;
    }

    const collections = deriveExternalCollectionNames(
      input.clientIdHash,
      input.subspace,
    );
    const record = PublicMcpNamespaceRecordSchema.parse({
      namespace: input.namespace,
      clientId: input.clientId,
      clientIdHash: input.clientIdHash,
      subspace: input.subspace,
      ...collections,
      bootstrapState: input.bootstrapState ?? 'ready',
      createdAt: now,
      lastSeenAt: now,
    });
    await this.documentStore.put(
      PUBLIC_MCP_NAMESPACE_COLLECTION,
      record.namespace,
      record,
    );
    return record;
  }
}
