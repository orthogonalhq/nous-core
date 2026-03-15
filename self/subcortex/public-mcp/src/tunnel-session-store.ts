import type {
  IDocumentStore,
  PublicMcpTunnelSessionRecord,
  PublicMcpUserHandle,
} from '@nous/shared';
import { PublicMcpTunnelSessionRecordSchema } from '@nous/shared';

export const PUBLIC_MCP_TUNNEL_SESSION_COLLECTION = 'public_mcp_tunnel_session';
export const PUBLIC_MCP_TUNNEL_NONCE_COLLECTION = 'public_mcp_tunnel_nonce';

export interface TunnelSessionStoreOptions {
  seedRecords?: readonly PublicMcpTunnelSessionRecord[];
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase();
}

export class TunnelSessionStore {
  private readonly seeded = new Map<string, PublicMcpTunnelSessionRecord>();
  private readonly consumedNonces = new Set<string>();

  constructor(
    private readonly documentStore: IDocumentStore,
    options: TunnelSessionStoreOptions = {},
  ) {
    for (const record of options.seedRecords ?? []) {
      const parsed = PublicMcpTunnelSessionRecordSchema.parse({
        ...record,
        host: normalizeHost(record.host),
      });
      this.seeded.set(parsed.sessionId, parsed);
    }
  }

  async save(
    record: PublicMcpTunnelSessionRecord,
  ): Promise<PublicMcpTunnelSessionRecord> {
    const parsed = PublicMcpTunnelSessionRecordSchema.parse({
      ...record,
      host: normalizeHost(record.host),
    });
    await this.documentStore.put(
      PUBLIC_MCP_TUNNEL_SESSION_COLLECTION,
      parsed.sessionId,
      parsed,
    );
    this.seeded.set(parsed.sessionId, parsed);
    return parsed;
  }

  async get(sessionId: string): Promise<PublicMcpTunnelSessionRecord | null> {
    const seeded = this.seeded.get(sessionId);
    if (seeded) {
      return seeded;
    }
    const raw = await this.documentStore.get<unknown>(
      PUBLIC_MCP_TUNNEL_SESSION_COLLECTION,
      sessionId,
    );
    return raw ? PublicMcpTunnelSessionRecordSchema.parse(raw) : null;
  }

  async getByHost(host: string): Promise<PublicMcpTunnelSessionRecord | null> {
    const normalized = normalizeHost(host);
    for (const record of this.seeded.values()) {
      if (record.host === normalized) {
        return record;
      }
    }
    const rows = await this.documentStore.query<unknown>(
      PUBLIC_MCP_TUNNEL_SESSION_COLLECTION,
      {
        where: { host: normalized },
        limit: 1,
      },
    );
    return rows[0] ? PublicMcpTunnelSessionRecordSchema.parse(rows[0]) : null;
  }

  async getByUserHandle(
    userHandle: PublicMcpUserHandle,
  ): Promise<PublicMcpTunnelSessionRecord | null> {
    for (const record of this.seeded.values()) {
      if (record.userHandle === userHandle) {
        return record;
      }
    }
    const rows = await this.documentStore.query<unknown>(
      PUBLIC_MCP_TUNNEL_SESSION_COLLECTION,
      {
        where: { userHandle },
        limit: 1,
      },
    );
    return rows[0] ? PublicMcpTunnelSessionRecordSchema.parse(rows[0]) : null;
  }

  async touch(sessionId: string, now: string): Promise<void> {
    const record = await this.get(sessionId);
    if (!record) {
      return;
    }
    await this.save({
      ...record,
      updatedAt: now,
      lastSeenAt: now,
    });
  }

  async consumeNonce(
    sessionId: string,
    nonce: string,
    consumedAt: string,
    expiresAt: string,
  ): Promise<boolean> {
    const nonceId = `${sessionId}:${nonce}`;
    if (this.consumedNonces.has(nonceId)) {
      return false;
    }
    const existing = await this.documentStore.get(
      PUBLIC_MCP_TUNNEL_NONCE_COLLECTION,
      nonceId,
    );
    if (existing) {
      return false;
    }

    await this.documentStore.put(PUBLIC_MCP_TUNNEL_NONCE_COLLECTION, nonceId, {
      id: nonceId,
      sessionId,
      nonce,
      consumedAt,
      expiresAt,
    });
    this.consumedNonces.add(nonceId);
    return true;
  }
}
