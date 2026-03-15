import type {
  IDocumentStore,
  PublicMcpNamespace,
  PublicMcpRateLimitBucketRecord,
} from '@nous/shared';
import { PublicMcpRateLimitBucketRecordSchema } from '@nous/shared';

export const PUBLIC_MCP_RATE_LIMIT_COLLECTION = 'public_mcp_rate_limit_buckets';

export interface ConsumeRateLimitInput {
  namespace: PublicMcpNamespace;
  tokenFingerprint: string;
  toolName: string;
  windowStartedAt: string;
  windowSeconds: number;
  maxRequests: number;
}

export interface RateLimitConsumptionResult {
  allowed: boolean;
  record: PublicMcpRateLimitBucketRecord;
}

export class RateLimitBucketStore {
  constructor(private readonly documentStore: IDocumentStore) {}

  private buildId(namespace: string, tokenFingerprint: string, toolName: string): string {
    return `${namespace}::${tokenFingerprint}::${toolName}`;
  }

  async get(
    namespace: string,
    tokenFingerprint: string,
    toolName: string,
  ): Promise<PublicMcpRateLimitBucketRecord | null> {
    const raw = await this.documentStore.get<unknown>(
      PUBLIC_MCP_RATE_LIMIT_COLLECTION,
      this.buildId(namespace, tokenFingerprint, toolName),
    );
    return raw ? PublicMcpRateLimitBucketRecordSchema.parse(raw) : null;
  }

  async consume(input: ConsumeRateLimitInput): Promise<RateLimitConsumptionResult> {
    const id = this.buildId(input.namespace, input.tokenFingerprint, input.toolName);
    const existing = await this.get(input.namespace, input.tokenFingerprint, input.toolName);
    const resetWindow =
      !existing || existing.windowStartedAt !== input.windowStartedAt;
    const requestCount = (resetWindow ? 0 : existing.requestCount) + 1;
    const blockedUntil =
      requestCount > input.maxRequests
        ? new Date(
            Date.parse(input.windowStartedAt) + input.windowSeconds * 1000,
          ).toISOString()
        : undefined;

    const record = PublicMcpRateLimitBucketRecordSchema.parse({
      namespace: input.namespace,
      tokenFingerprint: input.tokenFingerprint,
      toolName: input.toolName,
      windowStartedAt: input.windowStartedAt,
      windowSeconds: input.windowSeconds,
      requestCount,
      blockedUntil,
      updatedAt: input.windowStartedAt,
    });

    await this.documentStore.put(PUBLIC_MCP_RATE_LIMIT_COLLECTION, id, record);
    return {
      allowed: requestCount <= input.maxRequests,
      record,
    };
  }

  async clearNamespace(namespace: string): Promise<void> {
    const rows = await this.documentStore.query<PublicMcpRateLimitBucketRecord>(
      PUBLIC_MCP_RATE_LIMIT_COLLECTION,
      { where: { namespace } },
    );
    for (const row of rows) {
      await this.documentStore.delete(
        PUBLIC_MCP_RATE_LIMIT_COLLECTION,
        this.buildId(row.namespace, row.tokenFingerprint, row.toolName),
      );
    }
  }
}
