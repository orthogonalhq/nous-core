import type {
  IDocumentStore,
  PublicMcpNamespace,
  PublicMcpQuotaUsageRecord,
} from '@nous/shared';
import { PublicMcpQuotaUsageRecordSchema } from '@nous/shared';

export const PUBLIC_MCP_QUOTA_USAGE_COLLECTION = 'public_mcp_quota_usage';

export interface QuotaLimitSnapshot {
  maxReadUnits: number;
  maxWriteUnits: number;
  maxBytesReserved: number;
}

export interface ConsumeQuotaInput {
  namespace: PublicMcpNamespace;
  tokenFingerprint: string;
  windowStartedAt: string;
  windowEndsAt: string;
  readUnitsDelta?: number;
  writeUnitsDelta?: number;
  bytesReservedDelta?: number;
  limitSnapshot: QuotaLimitSnapshot;
}

export interface QuotaConsumptionResult {
  allowed: boolean;
  record: PublicMcpQuotaUsageRecord;
}

export class QuotaUsageStore {
  constructor(private readonly documentStore: IDocumentStore) {}

  private buildId(namespace: string, tokenFingerprint: string): string {
    return `${namespace}::${tokenFingerprint}`;
  }

  async get(
    namespace: string,
    tokenFingerprint: string,
  ): Promise<PublicMcpQuotaUsageRecord | null> {
    const raw = await this.documentStore.get<unknown>(
      PUBLIC_MCP_QUOTA_USAGE_COLLECTION,
      this.buildId(namespace, tokenFingerprint),
    );
    return raw ? PublicMcpQuotaUsageRecordSchema.parse(raw) : null;
  }

  async consume(input: ConsumeQuotaInput): Promise<QuotaConsumptionResult> {
    const id = this.buildId(input.namespace, input.tokenFingerprint);
    const existing = await this.get(input.namespace, input.tokenFingerprint);
    const resetWindow =
      !existing ||
      existing.windowStartedAt !== input.windowStartedAt ||
      existing.windowEndsAt !== input.windowEndsAt;
    const writeUnitsUsed =
      (resetWindow ? 0 : existing.writeUnitsUsed) + (input.writeUnitsDelta ?? 0);
    const readUnitsUsed =
      (resetWindow ? 0 : existing.readUnitsUsed) + (input.readUnitsDelta ?? 0);
    const bytesReserved =
      (resetWindow ? 0 : existing.bytesReserved) + (input.bytesReservedDelta ?? 0);

    const record = PublicMcpQuotaUsageRecordSchema.parse({
      namespace: input.namespace,
      tokenFingerprint: input.tokenFingerprint,
      windowStartedAt: input.windowStartedAt,
      windowEndsAt: input.windowEndsAt,
      readUnitsUsed,
      writeUnitsUsed,
      bytesReserved,
      limitSnapshot: input.limitSnapshot,
      updatedAt: input.windowStartedAt,
    });

    const allowed =
      writeUnitsUsed <= input.limitSnapshot.maxWriteUnits &&
      readUnitsUsed <= input.limitSnapshot.maxReadUnits &&
      bytesReserved <= input.limitSnapshot.maxBytesReserved;

    await this.documentStore.put(PUBLIC_MCP_QUOTA_USAGE_COLLECTION, id, record);
    return { allowed, record };
  }

  async clearNamespace(namespace: string): Promise<void> {
    const rows = await this.documentStore.query<PublicMcpQuotaUsageRecord>(
      PUBLIC_MCP_QUOTA_USAGE_COLLECTION,
      { where: { namespace } },
    );
    for (const row of rows) {
      await this.documentStore.delete(
        PUBLIC_MCP_QUOTA_USAGE_COLLECTION,
        this.buildId(row.namespace, row.tokenFingerprint),
      );
    }
  }
}
