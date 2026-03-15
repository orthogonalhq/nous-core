import type {
  IDocumentStore,
  PublicMcpHostedTenantBindingRecord,
  PublicMcpUserHandle,
} from '@nous/shared';
import { PublicMcpHostedTenantBindingRecordSchema } from '@nous/shared';

export const PUBLIC_MCP_HOSTED_TENANT_BINDING_COLLECTION =
  'public_mcp_hosted_tenant_binding';

export interface HostedTenantBindingStoreOptions {
  seedRecords?: readonly PublicMcpHostedTenantBindingRecord[];
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase();
}

export class HostedTenantBindingStore {
  private readonly seeded = new Map<string, PublicMcpHostedTenantBindingRecord>();

  constructor(
    private readonly documentStore: IDocumentStore,
    options: HostedTenantBindingStoreOptions = {},
  ) {
    for (const record of options.seedRecords ?? []) {
      const parsed = PublicMcpHostedTenantBindingRecordSchema.parse({
        ...record,
        host: normalizeHost(record.host),
      });
      this.seeded.set(parsed.bindingId, parsed);
    }
  }

  async save(
    record: PublicMcpHostedTenantBindingRecord,
  ): Promise<PublicMcpHostedTenantBindingRecord> {
    const parsed = PublicMcpHostedTenantBindingRecordSchema.parse({
      ...record,
      host: normalizeHost(record.host),
    });
    await this.documentStore.put(
      PUBLIC_MCP_HOSTED_TENANT_BINDING_COLLECTION,
      parsed.bindingId,
      parsed,
    );
    this.seeded.set(parsed.bindingId, parsed);
    return parsed;
  }

  async get(bindingId: string): Promise<PublicMcpHostedTenantBindingRecord | null> {
    const seeded = this.seeded.get(bindingId);
    if (seeded) {
      return seeded;
    }
    const raw = await this.documentStore.get<unknown>(
      PUBLIC_MCP_HOSTED_TENANT_BINDING_COLLECTION,
      bindingId,
    );
    return raw ? PublicMcpHostedTenantBindingRecordSchema.parse(raw) : null;
  }

  async getByHost(host: string): Promise<PublicMcpHostedTenantBindingRecord | null> {
    const normalized = normalizeHost(host);
    for (const record of this.seeded.values()) {
      if (record.host === normalized) {
        return record;
      }
    }
    const rows = await this.documentStore.query<unknown>(
      PUBLIC_MCP_HOSTED_TENANT_BINDING_COLLECTION,
      {
        where: { host: normalized },
        limit: 1,
      },
    );
    return rows[0] ? PublicMcpHostedTenantBindingRecordSchema.parse(rows[0]) : null;
  }

  async getByUserHandle(
    userHandle: PublicMcpUserHandle,
  ): Promise<PublicMcpHostedTenantBindingRecord | null> {
    for (const record of this.seeded.values()) {
      if (record.userHandle === userHandle) {
        return record;
      }
    }
    const rows = await this.documentStore.query<unknown>(
      PUBLIC_MCP_HOSTED_TENANT_BINDING_COLLECTION,
      {
        where: { userHandle },
        limit: 1,
      },
    );
    return rows[0] ? PublicMcpHostedTenantBindingRecordSchema.parse(rows[0]) : null;
  }
}
