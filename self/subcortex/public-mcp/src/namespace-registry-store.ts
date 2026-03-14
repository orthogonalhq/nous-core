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
  quotaProfileId?: string;
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
      return this.save({
        ...existing,
        lastSeenAt: now,
      });
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
      lifecycleState: 'active',
      quotaProfileId: input.quotaProfileId,
      createdAt: now,
      lastSeenAt: now,
    });
    return this.save(record);
  }

  async save(record: PublicMcpNamespaceRecord): Promise<PublicMcpNamespaceRecord> {
    const parsed = PublicMcpNamespaceRecordSchema.parse(record);
    await this.documentStore.put(
      PUBLIC_MCP_NAMESPACE_COLLECTION,
      parsed.namespace,
      parsed,
    );
    return parsed;
  }

  async markMutation(
    namespace: string,
    updatedAt = this.now(),
  ): Promise<PublicMcpNamespaceRecord> {
    const existing = await this.require(namespace);
    return this.save({
      ...existing,
      lastSeenAt: updatedAt,
      lastMutationAt: updatedAt,
    });
  }

  async markCompaction(
    namespace: string,
    updatedAt = this.now(),
  ): Promise<PublicMcpNamespaceRecord> {
    const existing = await this.require(namespace);
    return this.save({
      ...existing,
      lastSeenAt: updatedAt,
      lastCompactedAt: updatedAt,
      lastMutationAt: updatedAt,
    });
  }

  async quarantine(
    namespace: string,
    reason: string,
    updatedAt = this.now(),
  ): Promise<PublicMcpNamespaceRecord> {
    const existing = await this.require(namespace);
    return this.save({
      ...existing,
      lifecycleState: 'quarantined',
      quarantineReason: reason,
      quarantinedAt: updatedAt,
      lastSeenAt: updatedAt,
    });
  }

  async restore(namespace: string, updatedAt = this.now()): Promise<PublicMcpNamespaceRecord> {
    const existing = await this.require(namespace);
    return this.save({
      ...existing,
      lifecycleState: 'active',
      quarantineReason: undefined,
      quarantinedAt: undefined,
      lastSeenAt: updatedAt,
    });
  }

  async markPurging(
    namespace: string,
    updatedAt = this.now(),
  ): Promise<PublicMcpNamespaceRecord> {
    const existing = await this.require(namespace);
    return this.save({
      ...existing,
      lifecycleState: 'purging',
      lastSeenAt: updatedAt,
    });
  }

  async markPurged(
    namespace: string,
    updatedAt = this.now(),
  ): Promise<PublicMcpNamespaceRecord> {
    const existing = await this.require(namespace);
    return this.save({
      ...existing,
      lifecycleState: 'purged',
      purgedAt: updatedAt,
      lastSeenAt: updatedAt,
    });
  }

  private async require(namespace: string): Promise<PublicMcpNamespaceRecord> {
    const existing = await this.get(namespace);
    if (!existing) {
      throw new Error(`Unknown public MCP namespace: ${namespace}`);
    }
    return existing;
  }
}
