import type {
  IDocumentStore,
  PublicMcpAuditRecord,
} from '@nous/shared';
import { PublicMcpAuditRecordSchema } from '@nous/shared';

export const PUBLIC_MCP_AUDIT_COLLECTION = 'public_mcp_audit_projection';

export class AuditProjectionStore {
  constructor(private readonly documentStore: IDocumentStore) {}

  async save(record: PublicMcpAuditRecord): Promise<PublicMcpAuditRecord> {
    const parsed = PublicMcpAuditRecordSchema.parse(record);
    await this.documentStore.put(PUBLIC_MCP_AUDIT_COLLECTION, parsed.requestId, parsed);
    return parsed;
  }

  async get(requestId: string): Promise<PublicMcpAuditRecord | null> {
    const raw = await this.documentStore.get<unknown>(
      PUBLIC_MCP_AUDIT_COLLECTION,
      requestId,
    );
    if (!raw) {
      return null;
    }
    return PublicMcpAuditRecordSchema.parse(raw);
  }

  async listByNamespace(namespace: string): Promise<PublicMcpAuditRecord[]> {
    const rows = await this.documentStore.query<unknown>(
      PUBLIC_MCP_AUDIT_COLLECTION,
      {
        where: { namespace },
        orderBy: 'createdAt',
        orderDirection: 'desc',
      },
    );
    return rows.map((row) => PublicMcpAuditRecordSchema.parse(row));
  }

  async countByNamespace(namespace: string): Promise<number> {
    return (await this.listByNamespace(namespace)).length;
  }
}
